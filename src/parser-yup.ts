'use strict';

import * as jsyaml from "js-yaml";
export { YAMLException } from "js-yaml";

import {
  toStringArray,
  splitToStringArray,
  allStatesInTransitionTableDeclared,
  checkSimulatable,
  TransitionParser,
  parseTable
} from './parser-utils';

import * as yup from 'yup';

//import * as _ from 'lodash';
import _ from '../src/lodash-mixins';
let __ = _;

import * as util from "util";

import {
  StringArraySchema,
  AutomatonType, AutomatonTypeStrings,
  FSATransitionSchema, PDATransitionSchema, TMTransitionSchema,
  Transition, FSATransition, PDATransition, TMTransition,
  PDATransitionTable, TMTransitionTable, TransitionTable,
} from './TransitionSpec'

import TMSpecError from '../src/TMSpecError';
export { TMSpecError };

function stringDefaultNull(this: yup.StringSchema, defaultValue: string) {
  return this
    .default(defaultValue)
    .transform(function(value /*, originalValue*/) {
      return _.isNil(value) ? defaultValue : value;
    });
}
// https://github.com/jquense/yup/issues/312#issuecomment-442854307
yup.addMethod(yup.string, 'defaultNull', stringDefaultNull);
declare module 'yup' {
  interface StringSchema {
    defaultNull(defaultValue: string): StringSchema
  }
}

function booleanAlways(this: yup.BooleanSchema, always: boolean) {
  return this
    .default(always)
    .transform(function(/*value , originalValue*/) {
      return always;
    });
}
// https://github.com/jquense/yup/issues/312#issuecomment-442854307
yup.addMethod(yup.boolean, 'always', booleanAlways);
declare module 'yup' {
  interface BooleanSchema {
    always(always: boolean): BooleanSchema
  }
}

function statesDeclared (this, value) {
  let spec = this.parent;
  let declared = _.keys(spec.table);
  return _.every(value, state => _.includes(declared, state))
}

const FSATransitionParser: TransitionParser<FSATransition> =
  function(from, symbol, trans) {
    return __
      .castArray(trans || from)
      .map((state): FSATransition =>
        FSATransitionSchema.validateSync({
          from: from,
          read: symbol,
          to: state
        }))
  };

const PDATransitionParser: TransitionParser<PDATransition> =
  function(from, symbol, trans) {
    return __
      .chain(trans || {})
      .castArray()
      .flatMap((trans): PDATransition[] =>
        __.chain(toStringArray(trans.state))
          .unionWith(
            toStringArray(trans.states),
            _.isEqual
          )
          .unionWith(
            _.difference(
              toStringArray(Object.keys(trans)),
              ["pop", "push", "state", "states"]
            ),
            _.isEqual
          )
          .map(String)
          .thru((states) => _.isEmpty(states) ? [from] : states)
          .map((to) =>
            PDATransitionSchema.validateSync({
              from: from,
              read: symbol,
              pop: _.castArray(trans.pop || []).map(String),
              push: _.castArray(trans.push || []).map(String),
              to: to
            })
          )
          .value()
      )
      .value()
  };

const TMTransitionParser: TransitionParser<TMTransition> =
  function (from, symbol, trans) {
    return __
      .castArray(trans || {})
      .map((trans) => _.isString(trans) ? {move: trans} : trans)
      .map((trans): TMTransition => {
        console.log('trans:', util.inspect(trans));

        let tos = _.chain(trans).at(['state', 'L', 'R', 'S']).flatten().filter(_.identity).value();
        console.log('to[]:', util.inspect(tos));
        if (tos.length > 1)
          throw new TMSpecError('Ambiguous spec: can only specify one destination state per transition', {
            problemValue: trans
          });
        let to = tos[0] || from;

        let moves = _.chain(trans).keys().intersection(['L', 'R', 'S']).value();
        console.log('move[]:', util.inspect(moves));
        if (moves.length > 1)
          throw new TMSpecError('Ambiguous spec: can only specify one move direction per transition', {
            problemValue: trans
          });
        let move = moves[0]  || trans.move as string || 'S';
        console.log('move:', move);
        if (!_.contains(['L', 'R', 'S'], move))
          throw new TMSpecError('Illegal move', {
            problemValue: trans
          });

        return TMTransitionSchema.validateSync({
          from: from,
          read: symbol,
          to: String(to),
          write: String(trans.write || symbol),
          move: String(move)
        });
      })
  };

function getParser(type: AutomatonType): TransitionParser<Transition> {
  if (type === AutomatonType.fsa)
    return FSATransitionParser;
  else if (type === AutomatonType.pda)
    return PDATransitionParser;
  else
    return TMTransitionParser;
}

let schemaFields = {
  startStates: StringArraySchema(toStringArray)
    .test(
      'start states declared',
      'all start states must be declared',
      statesDeclared),

  acceptStates: StringArraySchema(toStringArray)
    .test(
      'accept states declared',
      'all accept states must be declared',
      statesDeclared),

  input: StringArraySchema(splitToStringArray),

  type: yup
    .mixed<keyof typeof AutomatonType>()
    .nullable().default('tm')
    .oneOf(
      Object.values(AutomatonType),
      'Automaton must be of type ' + JSON.stringify(Object.values(AutomatonType))
    ),

  epsilon: yup
    .string()
    .when('type', (type, schema) => {
      if (type === AutomatonType.fsa || type === AutomatonType.pda)
        return schema.defaultNull('');
      else
        // TM does not have epsilon transitions
        return schema.strip(true);
    })
    .test(
      'epsilon not in input',
      'input string cannot contain the epsilon symbol',
      function (this, epsilon) {
        const input = splitToStringArray(this.parent.input);
        return !_.includes(input, epsilon);
      }),

  blank: yup
    .string()
    .when('type', (type, schema) => {
      if (type === AutomatonType.tm)
        // only TM has blank symbol
        return schema.required();
      else
        return schema.strip(true);
    }),

  nTape: yup
    .number()
    .when('type', (type, schema) => {
      if (type === 'tm')
        return schema.default(1).required().min(1);
      else
        return schema.strip(true);
    }),

  table: yup
    .object()
    .default({})
    .when('type', (type, schema) =>
      schema.transform((table) => parseTable(table, getParser(type)))
    )
    .test('all states declared',
      'all states must be declared',
      allStatesInTransitionTableDeclared
    ),

  simulatable: yup
    .boolean()
    .when(['type', 'startStates', 'epsilon', 'table'], (type, startStates, epsilon, table, schema) => {
      return schema.always(checkSimulatable(type, startStates, epsilon, table));
    })
};

let schema = yup.object(schemaFields)
  .from('["start states"]', 'startStates')
  .from('["start state"]', 'startStates')
  .from('["accept states"]', 'acceptStates')
  .from('["accept state"]', 'acceptStates')
;

export type AutomatonSpec = yup.InferType<typeof schema>;

export function parseSpec(str: string): AutomatonSpec {
  let obj = jsyaml.safeLoad(str);
  if (obj == null) obj = {};
  console.log(util.inspect(obj, false, null, true));

  // expand synonyms
  let synonyms = _.get(obj, 'synonyms', {});
  obj = _.cloneDeepWith(obj, value => {
    return _.get(synonyms, value, undefined);
  });
  console.log(util.inspect(obj, false, null, true));

  let transObj = schema.validateSync(obj);

  console.log(util.inspect(transObj, false, null, true));
  return transObj;
}