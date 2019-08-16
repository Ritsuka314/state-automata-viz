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

import {Exclude, Expose, plainToClass, plainToClassFromExist, Transform} from "class-transformer";
import "reflect-metadata";

//import * as _ from 'lodash';
import _ from './lodash-mixins';
let __ = _;

import { validateSync, IsIn, ValidateIf, IsDefined, ValidatorConstraintInterface, ValidationArguments, Validate, ValidatorConstraint } from "class-validator";

import * as util from "util";

import {
  automatonTypes,
  Transition, FSATransition, PDATransition, TMTransition,
  TransitionTable, FSATransitionTable, PDATransitionTable, TMTransitionTable
} from './TransitionSpec';

import TMSpecError from './TMSpecError';
export { TMSpecError };

function makeType (type): string{
  return String(type || 'tm').toLowerCase();
}

const matched = (x) => ({
  on: () => matched(x),
  otherwise: () => x,
});

const match = (x) => ({
  on: (pred, fn) => (pred(x) ? matched(fn(x)) : match(x)),
  otherwise: fn => fn(x),
});

@ValidatorConstraint()
class StatesDeclared implements ValidatorConstraintInterface{
  validate(states, args: ValidationArguments) {
    let declared = _.keys((<AutomatonSpec>args.object).table);
    return _.every(states, state => _.includes(declared, state))
  }
}

@ValidatorConstraint()
class AllStatesInTransitionTableDeclared implements ValidatorConstraintInterface{
  validate = allStatesInTransitionTableDeclared;
}

@ValidatorConstraint()
class EpsilonNotInInput implements ValidatorConstraintInterface{
  validate(epsilon: string, args: ValidationArguments) {
    const input = splitToStringArray((<AutomatonSpec>args.object).input);
    return !_.includes(input, epsilon);
  }
}

const FSATransitionParser: TransitionParser<FSATransition> =
  function (from, symbol, trans) {
    return __
      .castArray(trans || from)
      .map(String)
      .map((state): FSATransition =>
        ({
          from: from,
          read: symbol,
          to: state
        })
      )
  };

const PDATransitionParser: TransitionParser<PDATransition> =
  function (from, symbol, trans) {
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
            ({
              from: from,
              read: symbol,
              pop: _.castArray(trans.pop || []).map(String),
              push: _.castArray(trans.push || []).map(String),
              to: to
            }))
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

        return {
          from: from,
          read: symbol,
          to: String(to),
          write: String(trans.write || symbol),
          move: String(move)
        };
      })
  };

function getParser(type: string): TransitionParser<Transition> {
  return match(makeType(type))
    .on(_.matches('fsa'), () =>
      FSATransitionParser
    )
    .on(_.matches('pda'), () =>
      PDATransitionParser
    )
    .otherwise(/*_.matches('tm'), */() =>
      TMTransitionParser
    )
}

@Exclude()
export class AutomatonSpec {
  @Expose({ name: "start states" })
  @Transform(toStringArray)
  @Validate(StatesDeclared, {
    message: "All start states must be declared"
  })
  startStates: string[];

  @Expose({ name: "accept states" })
  @Transform(toStringArray)
  @Validate(StatesDeclared, {
    message: "All accept states must be declared"
  })
  acceptStates: string[];

  @Expose()
  @Transform(splitToStringArray)
  input: string[];

  @Expose()
  @Transform(makeType)
  @IsIn(automatonTypes, {
    message: 'Automaton must be of type ' + JSON.stringify(automatonTypes)
  })
  type: string;

  @Expose()
  @Transform((val) =>
    _.isNil(val) ? '' : String(val)
  )
  @Validate(EpsilonNotInInput,{
    message: "input string cannot contain the epsilon symbol"})
  epsilon: string;

  @Expose()
  @ValidateIf(o => o.type === "tm")
  @IsDefined()
  blank: string;

  @Expose()
  @Transform((val, obj) =>
    obj.type === "tm" ?
      _.isNil(val) ? 1 : Number(val) :
      undefined
  )
  nTape: number;

  // impossible to do
  // synonyms: Synonyms<FSATransition> | Synonyms<PDATransition> | Synonyms<TMTransition>;

  @Expose()
  @Transform((val, obj, type) => {
    return parseTable(val, getParser(makeType(obj.type)));
  })
  @Validate(AllStatesInTransitionTableDeclared, {
    message: "All states must be declared"
  })
  table: FSATransitionTable | PDATransitionTable | TMTransitionTable;

  simulatable: boolean;

  checkSimulatable() {
    return this.simulatable = checkSimulatable(this.type, this.startStates, this.epsilon, this.table);
  }
}

export function parseSpec(str: string): AutomatonSpec {
  let obj = jsyaml.safeLoad(str);
  if (obj == null) obj = {};
  console.log(util.inspect(obj, false, null, true));

  let spec: AutomatonSpec = plainToClass(AutomatonSpec, obj);
  console.log(util.inspect(spec, false, null, true));

  spec.checkSimulatable();
  console.log(util.inspect(spec, false, null, true));

  let es = validateSync(spec);
  console.log(util.inspect(es, false, null, true));
  if (es.length) throw new TMSpecError('Validation Error', {
    validationErrors: es
  });

  return spec;
}
