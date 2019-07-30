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
  type: "fsa" | "pda" | "turing"
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
  
  obj.startStates = _.castArray(obj['start state'] || obj['start states']).map(String);
  delete obj['start state'], obj['start states'];
  
  obj.input = (function(s) {
    if (_.isNil(s))
      return [];
    else if (s instanceof Array)
      return s
    else if (typeof s === "string" || s instanceof String)
      return s.split("");
    else
      throw new TMSpecError("Unrecognized input format", {
        problemValue: s,
        info: "Automaton input can either be a string or an array."
      })
  })(obj.input);
  
  // for backward compatibility
  // assume turing machine when not specified
  automaton_type = obj.type = obj.type || "turing" ;
  obj.type = obj.type.toLowerCase();
  
  // make states their own synonyms
  var states = _.keys(obj.table);
  obj.synonyms = Object.assign(obj.synonyms || {},
    _.zipObject(
      states,
      _.map(states, (s) =>  ({state: [s]}))
    )
  );
  
  switch (obj.type) {
    case "fsa":
      parseInstructionObject = parseInstructionObject_FSA;
      break;
    case "pda":
      parseInstructionObject = parseInstructionObject_PDA;
      break;
    case "turing":
      parseInstructionObject = parseInstructionObject_Tape;

      if (obj.blank == null) {
        throw new TMSpecError('No blank symbol was specified',
        {suggestion: 'Examples: <code>blank: \' \'</code>, <code>blank: \'0\'</code>'});
      }    
      obj.blank = String(obj.blank);
        
      // predefined synonyms
      // overrides user defined to prevent inconsistent notation,
      // e.g. 'R' and {R: ..} being different.
      obj.synonyms['L'] = {move: 'L'};
      obj.synonyms['R'] = {move: 'R'};
      break;
    default:
      throw new TMSpecError('Illegal automaton type',
      {problemValue: obj.type,
       info: 'Automaton has to be either <code>fsa</code>, <code>pda</code>, or <code>turing</code>'});
  }
  
  obj.acceptStates = _.castArray(obj["accept states"] || obj["accept state"]).map(String);
  delete obj["accept states"], obj["accept state"];
  
  if ("epsilon" in obj) {
    switch (obj.type) {
      case "fsa":
      case "pda":
        obj.epsilon = String(obj.epsilon);
        if (_.some(obj.input, (x) => x === obj.epsilon))
          throw new TMSpecError("Input cannot contain epsilon");
        break;
      default:
        throw new TMSpecError("only fsa and pda can specify epsilon symbol");
    }
  }

  // parse synonyms and transition table
  checkTableType(obj.table); // parseSynonyms assumes a table object
  var synonyms = parseSynonyms(obj.synonyms, obj.table);
  obj.table = parseTable(synonyms, obj.table);
  
  // check for references to non-existent states
  var badStates = _.filter(obj.startStates, s => !(s in obj.table));
  if (badStates.length) {
    throw new TMSpecError('The start state has to be declared in the transition table',
    {problemValue: badStates});
  }
  
  obj.simulatable = checkSimulatable(obj);

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

function isPrefix(arr1, arr2) {
  return _.isEqual(arr1, _.take(arr2, arr1.length)) ||
         _.isEqual(arr2, _.take(arr1, arr2.length));
}

function checkSimulatable(spec) {
  switch (spec.type) {
    case "fsa":
      return true;
    case "pda":
      if (spec.startStates.length > 1) return false;

      var rst = _(spec.table)
        .mapValues(stateObj =>
          _(stateObj)
            .mapValues((actions, symbol) =>
              _(actions)
                .map(action =>
                  [symbol, action.pop, action.push])
                .value())
            .values()
            .flatten()
            .value())
        .mapValues(outs =>
          _(_.range(outs.length))
            .map(i =>
              _(_.range(i+1, outs.length))
                .map(j => {
                  var out1 = outs[i],
                    out2 = outs[j];
                  if (_.isEqual(out1, out2)) return null;
                  else if ((out1[0] === out2[0] || out1[0] === spec.epsilon || out2[0] === spec.epsilon) &&
                    isPrefix(out1[1], out2[1])) return [out1, out2];
                  else return null;})
                .filter(item => !_.isNil(item))
                .value())
            .flatten()
            .value())
        .pickBy(item => item.length)
        .value();

      var label = (trans) => trans[0] + ', [' + trans[1] + '] ↦ [' + trans[2] + ']';
      var pair2str = (pair) => label(pair[0]) + (pair.length > 1 ? " AND " + label(pair[1]) : "");

      console.log("Non deterministic transition pairs in PDA:")
      _.forOwn(rst, (pairs, state) => {
        state = "In state " + state + ":";
        console.log(state, pair2str(pairs[0]));

        var indent = _.repeat(" ", state.length);
        _(pairs)
          .drop(1)
          .forEach(pair => console.log(indent, pair2str(pair)));
      });

      return _.isEmpty(rst);
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
      return parseInstruction(null, table, null, actionVal);
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
        return parseInstruction(synonyms, val, state, actionVal);
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

function makeInstruction_PDA(pop, push, state) {
  return Object.freeze({pop: pop, push: push, state: state});
}

// omits null/undefined properties
// (?string, direction, ?string) -> {symbol?: string, move: direction, state?: string}
function makeInstruction_Tape(symbol, move, state) {
  return Object.freeze({symbol: symbol, move: move, state: state});
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
function parseInstruction(synonyms, table, currState, val) {
  return checkTarget(table, function () {
    switch (typeof val) {
      case 'string': return parseInstructionObject(currState, parseInstructionString(synonyms, val));
      case 'object': return parseInstructionObject(currState, val);
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
type val =
    null
  | String
  | [String]
  | {states: String}
  | {states: [String]}
*/
function parseInstructionObject_FSA(currState, val) {
  if (val == null) return makeInstruction_FSA(currState);
  else if (typeof val === "string") return makeInstruction_FSA(val);
  else if (val instanceof Array) {
    if (_.every(val, (item) => typeof item === "string"))
      return makeInstruction_FSA(val);
    else
      throw new TMSpecError("Unrecognized state transition", {problemValue: val});
  }
  else if (val instanceof Object &&
           "state" in val &&
           _.keys(val).length === 1) { return makeInstruction_FSA(val.state); }
  else
    throw new TMSpecError("Unrecognized state transition", {
      problemValue: val
    });
}

// type val = {
//   pop? : String | [String]
//   push? : String | [String]
//   state?: String
// }
function parseInstructionObject_PDA(currState, val) {
  if (val instanceof Array)
    return _.flatMap(val, (item) => 
      parseInstructionObject_PDA(currState, item));
  
  function toStringArray(val) {
    return _.map(_.isNil(val) ? [] : _.castArray(val), String);
  }
  
  var pop  = toStringArray(val.pop),
      push = toStringArray(val.push),
      state = _.uniq(
        toStringArray(val.state) +
        _.difference(
          toStringArray(Object.keys(val)),
          ["pop", "push", "state"]
        )
      );
  if (state.length == 0) state = [currState];
      
  return _.castArray(makeInstruction_PDA(pop, push, state));
}

// type val =
//     {write?: any,
//      L: ?string}
//   | {write?: any,
//      R: ?string}
function parseInstructionObject_Tape(currState, val) {
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
  if (state.length == 0) state = currState ? [currState] : null;  

  symbol = val.write ? String(val.write) : null;
  
  return makeInstruction_Tape(symbol, move, state);
}

exports.TMSpecError = TMSpecError;
exports.parseSpec = parseSpec;
// re-exports
exports.YAMLException = jsyaml.YAMLException;
