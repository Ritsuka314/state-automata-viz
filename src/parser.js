'use strict';

var TM = require('./TuringMachine'),
    jsyaml = require('js-yaml'),
    _ = require('lodash');

/**
 * Thrown when parsing a string that is valid as YAML but invalid
 * as a machine specification.
 *
 * Examples: unrecognized synonym, no start state defined,
 * transitioning to an undeclared state.
 *
 * A readable message is generated based on the details (if any) provided.
 * @param {string} reason  A readable error code.
 *   As an error code, this should be relatively short and not include runtime values.
 * @param {?Object} details Optional details. Possible keys:
 *                          problemValue, state, key, synonym, info, suggestion
 */
function TMSpecError(reason, details) {
  this.name = 'TMSpecError';
  this.stack = (new Error()).stack;

  this.reason = reason;
  this.details = details || {};
}
TMSpecError.prototype = Object.create(Error.prototype);
TMSpecError.prototype.constructor = TMSpecError;

// generate a formatted description in HTML
Object.defineProperty(TMSpecError.prototype, 'message', {
  get: function () {
    var header = this.reason;
    var details = this.details;

    function code(str) { return '<code>' + str + '</code>'; }
    function showLoc(state, symbol, synonym) {
      if (state != null) {
        if (symbol != null) {
          return ' in the transition from state ' + code(state) + ' and symbol ' + code(symbol);
        } else {
          return ' for state ' + code(state);
        }
      } else if (synonym != null) {
        return ' in the definition of synonym ' + code(synonym);
      }
      return '';
    }
    var problemValue = details.problemValue ? ' ' + code(details.problemValue) : '';
    var location = showLoc(details.state, details.symbol, details.synonym);
    var sentences = ['<strong>' + header + problemValue + '</strong>' + location
      , details.info, details.suggestion]
      .filter(_.identity)
      .map(function (s) { return s + '.'; });
    if (location) { sentences.splice(1, 0, '<br>'); }
    return sentences.join(' ');
  },
  enumerable: true
});

var automaton_type;
// forward declaration
var parseInstructionObject;

/*
type TransitionTable = {
  [key: string]: ?{[key: string]: string}
}

type TMSpec = {
  blank: string,
  type: "fsa" | "turing"
  start state: string | [string],
  table: TransitionTable
}
*/

// IDEA: check with flow (flowtype.org)
// throws YAMLException on YAML syntax error
// throws TMSpecError for an invalid spec (eg. no start state, transitioning to an undefined state)
// string -> TMSpec
function parseSpec(str) {
  var obj = jsyaml.safeLoad(str);
  // check for required object properties.
  // auto-convert .blank and 'start state' to string, for convenience.
  if (obj == null) { throw new TMSpecError('The document is empty',
    {info: 'Every Turing machine requires a <code>blank</code> tape symbol,' +
    ' a <code>start state</code>, and a transition <code>table</code>'}); }
    
  function ensureBlankDefined() {
    var detailsForBlank = {suggestion:
      'Examples: <code>blank: \' \'</code>, <code>blank: \'0\'</code>'};
    if (obj.blank == null) {
      throw new TMSpecError('No blank symbol was specified', detailsForBlank);
    }
  }
  
  obj.startState = obj['start state'];
  delete obj['start state'];
  if (obj.startState == null) {
    throw new TMSpecError('No start state was specified',
    {suggestion: 'Assign one using <code>start state: </code>'});
  }
  
  obj.input = (function(s) {
    if (_.isNil(s))
      return [];
    else if (s instanceof Array)
      return s
    else if (typeof s === "string" || s instanceof String)
      return s.split("");
    else
      throw new TMSpec("Unrecognized input format", {
        problemValue: s,
        info: "Automaton input can either be a string or an array."
      })
  })(obj.input);
  
  // backward compatibility
  // when not specified, assume turing machine
  automaton_type = obj.type = obj.type || "turing" ;
  
  if (obj.type === "fsa") {
    // FSA may have multiple start states
    // make states their own synonyms
    var states = _.keys(obj.table);
    obj.synonyms = Object.assign(obj.synonyms || {},
      _.zipObject(
        states,
        _.map(states, (s) => {return {state: [s]}})
      ));
    obj.startState = _.castArray(obj.startState).map(String);
    parseInstructionObject = parseInstructionObject_FSA;
  }
  else {
    // pda, lba, turing can have only one start state
    obj.startState = String(obj.startState);
    if (obj.type === "turing") {
      parseInstructionObject = parseInstructionObject_Tape;
      ensureBlankDefined();
      obj.blank = String(obj.blank);
      // predefined synonyms
      // overrides user defined to prevent inconsistent notation,
      // e.g. 'R' and {R: ..} being different.
      obj.synonyms['L'] = {move: 'L'};
      obj.synonyms['R'] = {move: 'R'};
    }
    else {
      throw new TMSpecError('Illegal automaton type',
      {problemValue: obj.type,
      info: 'Automaton has to be either <code>fsa</code>, <code>pda</code>, or <code>turing</code>'});
    }
  }
  
  obj.acceptStates = _.castArray(obj["accept states"] || obj["accept state"]);
  delete obj["accept states"], obj["accept state"];
  
  if ("epsilon transition" in obj) {
    if (obj.type === "fsa") {
      obj.epsilonTransition = obj["epsilon transition"];
      delete obj["epsilon transition"];
      if (_.some(obj.input, (x) => x === obj.epsilonTransition))
        throw new TMSpecError("Input cannot contain epsilon");
    } else
      throw new TMSpecError("Automaton is nondeterministic",
      {suggestion: "Only FSA can have epsilon transitions"});
  }

  // parse synonyms and transition table
  checkTableType(obj.table); // parseSynonyms assumes a table object
  var synonyms = parseSynonyms(obj.synonyms, obj.table);
  obj.table = parseTable(synonyms, obj.table);
  // check for references to non-existent states
  if (!(obj.startState in obj.table)) {
    throw new TMSpecError('The start state has to be declared in the transition table');
  }

  return obj;
}

function checkTableType(val) {
  if (val == null) {
    throw new TMSpecError('Missing transition table',
    {suggestion: 'Specify one using <code>table:</code>'});
  }
  if (typeof val !== 'object') {
    throw new TMSpecError('Transition table has an invalid type',
    {problemValue: typeof val,
    info: 'The transition table should be a nested mapping from states to symbols to instructions'});
  }
}

// (any, Object) -> ?SynonymMap
function parseSynonyms(val, table) {
  if (val == null) {
    return null;
  }
  if (typeof val !== 'object') {
    throw new TMSpecError('Synonyms table has an invalid type',
      {problemValue: typeof val,
      info: 'Synonyms should be a mapping from string abbreviations to instructions'
        + ' (e.g. <code>accept: {R: accept}</code>)'});
  }
  return _.mapValues(val, function (actionVal, key) {
    try {
      return parseInstruction(null, table, actionVal);
    } catch (e) {
      if (e instanceof TMSpecError) {
        e.details.synonym = key;
        if (e.reason === 'Unrecognized string') {
          e.details.info = 'Note that a synonym cannot be defined using another synonym';
        }
      }
      throw e;
    }
  });
}

// (?SynonymMap, {[key: string]: string}) -> TransitionTable
function parseTable(synonyms, val) {
  return _.mapValues(val, function (stateObj, state) {
    if (stateObj == null) {
      // case: halting state
      return null;
    }
    if (typeof stateObj !== 'object') {
      throw new TMSpecError('State entry has an invalid type',
      {problemValue: typeof stateObj, state: state,
      info: 'Each state should map symbols to instructions. An empty map signifies a halting state.'});
    }
    return _.mapValues(stateObj, function (actionVal, symbol) {
      try {
        return parseInstruction(synonyms, val, actionVal);
      } catch (e) {
        if (e instanceof TMSpecError) {
          e.details.state = state;
          e.details.symbol = symbol;
        }
        throw e;
      }
    });
  });
}

// {states: [string]}
function makeInstruction_FSA(states) {
  return Object.freeze({state: _.castArray(states).map(String)});
}

// omits null/undefined properties
// (?string, direction, ?string) -> {symbol?: string, move: direction, state?: string}
function makeInstruction_Tape(symbol, move, state) {
  return Object.freeze(_.omitBy({symbol: symbol, move: move, state: state},
    function (x) { return x == null; }));
}

function checkTarget(table, instruct) {
  if (automaton_type === "fsa")
    if (!_.every(instruct.state, (s) => s in table))
      throw new TMSpecError('Undeclared state', {problemValue: instruct.states,
        suggestion: 'Make sure to list all states in the transition table and define their transitions (if any)'});
  else if (automaton_type === "turing")
    if (instruct.state != null && !(instruct.state in table)) {
      throw new TMSpecError('Undeclared state', {problemValue: instruct.state,
      suggestion: 'Make sure to list all states in the transition table and define their transitions (if any)'});
    }
  return instruct;
}

// throws if the target state is undeclared (not in the table)
// type SynonymMap = {[key: string]: TMAction}
// (SynonymMap?, Object, string | Object) -> TMAction
function parseInstruction(synonyms, table, val) {
  return checkTarget(table, function () {
    switch (typeof val) {
      case 'string': return parseInstructionString(synonyms, val);
      case 'object': return parseInstructionObject(val);
      default: throw new TMSpecError('Invalid instruction type',
        {problemValue: typeof val,
          info: 'An instruction can be a string (a direction <code>L</code>/<code>R</code> or a synonym)'
            + ' or a mapping (examples: <code>{R: accept}</code>, <code>{write: \' \', L: start}</code>)'});
    }
  }());
}

// case: synonym
function parseInstructionString(synonyms, val) {
  if (synonyms && synonyms[val]) {
    return synonyms[val];
  } else {
    throw new TMSpecError('Unrecognized string',
      {problemValue: val,
      info: 'An instruction can be a string if it\'s a synonym or a direction'});
  }
}

/*
type ActionObj =
    {states: String}
  | {states: [String]}
*/
function parseInstructionObject_FSA(val) {
  if (val == null) { throw new TMSpecError('Missing instruction');}
  else if (val instanceof Array) {
    if (_.every(val, (item) => typeof item === "string"))
      return makeInstruction_FSA(_.map(val, (item) => String(item)));
    else
      throw new TMSpecError("Unrecognized state transition", {problemValue: val});
  }
  else if (typeof val === "string") return makeInstruction_FSA([String(val)]);
  else if (val instanceof Object &&
           "state" in val &&
           _.keys(val).length === 1) { return makeInstruction_FSA(val.state); }
  else
    throw new TMSpecError("Unrecognized state transition", {
      problemValue: val
    });
}

// type val =
//     {write?: any,
//      L: ?string}
//   | {write?: any,
//      R: ?string}
function parseInstructionObject_Tape(val) {
  var symbol, move, state;
  if (val == null) { throw new TMSpecError('Missing instruction'); }
  
  // one L/R key is required
  // Head movement can be specified as one of the keys L/R,
  // in which case state can be specified as its value
  // (backward compatibility);
  // or as the value of the key move
  // in which case state can be specified as value of key state
  if (('L' in val) + ('R' in val) + ('move' in val) > 1) {
    throw new TMSpecError('Conflicting tape movements',
    {info: 'Each instruction needs exactly one movement direction, but more were found'});
  }
  
  // normalize representation
  move = val.move || ('L' in val ? 'L' : null) || ('R' in val ? 'R' : null);
  if (move && !(move === 'L' || move === 'R'))
    throw new TMSpecError('unrecognized movement direction',
    {info: 'Move direction has to be one of <code>L</code>, <code>R</code>',
     problemValue: val.move});
    
  state = _.compact(_.concat(val.state, val.L, val.R)).filter(String);

  symbol = val.write ? String(val.write) : null;
  
  return makeInstruction_Tape(symbol, move, state);
}

exports.TMSpecError = TMSpecError;
exports.parseSpec = parseSpec;
// re-exports
exports.YAMLException = jsyaml.YAMLException;
