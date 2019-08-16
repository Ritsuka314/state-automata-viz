'use strict';

import * as jsyaml from "js-yaml";
export { YAMLException } from "js-yaml";

import {Exclude, Expose, plainToClass, plainToClassFromExist, Transform} from "class-transformer";
import "reflect-metadata";

//import * as _ from 'lodash';
import _ from './lodash-mixins';
let __ = _;

import { validateSync, IsIn, ValidateIf, IsDefined, ValidatorConstraintInterface, ValidationArguments, Validate, ValidatorConstraint } from "class-validator";

import * as util from "util";

import TMSpecError from './TMSpecError';
export { TMSpecError };

function toStringArray (val): string[] {
  if (_.isNil(val))
    return [];
  if (_.isString(val))
    return [val];
  else
    return _.castArray(val).map(String);
}

function splitToStringArray (val): string[] {
  if (_.isNil(val))
    return [];
  if (_.isString(val))
    return val.split("");
  if (_.isArray(val))
    return val.map(String);
  else
    return String(val).split("");
}

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

function isPrefix(arr1, arr2) {
  return _.isEqual(arr1, _.take(arr2, arr1.length)) ||
    _.isEqual(arr2, _.take(arr1, arr2.length));
}

let automatonTypes = ['fsa', 'pda', 'tm'];

export type FSATransition = {from: string, read: string, to: string}
export type PDATransition = {from: string, read: string, push: string[], pop: string[], to: string}
export type TMTransition = {from: string, read: string, write: string, move: string, to: string}
export type Transition = FSATransition | PDATransition | TMTransition;

export type TransitionTable<T extends Transition> = {[state: string] : {[symbol: string]: T[]}};

export type FSATransitionTable = TransitionTable<FSATransition>;
export type PDATransitionTable = TransitionTable<PDATransition>;
export type TMTransitionTable = TransitionTable<TMTransition>;

@ValidatorConstraint()
class StatesDeclared implements ValidatorConstraintInterface{
  validate(states, args: ValidationArguments) {
    let declared = _.keys((<AutomatonSpec>args.object).table);
    return _.every(states, state => _.includes(declared, state))
  }
}

@ValidatorConstraint()
class AllStatesDeclared implements ValidatorConstraintInterface{
  validate(table, args: ValidationArguments) {
    return _.chain(table)
      .values()
      .flatMap(stateObject =>
        __.chain(stateObject)
          .values()
          .flatten()
          .map(transition => transition.to)
          .value()
      )
      .every(state =>
        __.chain(table)
          .keys()
          .tap(console.log)
          .includes(state)
          .value()
      )
      .value();
  }
}

@ValidatorConstraint()
class EpsilonNotInInput implements ValidatorConstraintInterface{
  validate(epsilon: string, args: ValidationArguments) {
    const input = splitToStringArray((<AutomatonSpec>args.object).input);
    return !_.includes(input, epsilon);
  }
}

type TransitionParser<T extends Transition> =
  (from: string, symbol: string, trans) => T[];

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

function parseTable<T extends Transition>(table, parser: TransitionParser<T>): TransitionTable<T> {
  return __
    .chain(table)
    .mapKeys((val, key) => String(key))
    .mapValues((outTrans, from) =>
      __.chain(outTrans)
        .toPairs()
        .flatMap(_.spread((symbols, trans) =>
          __.castArray(String(symbols).split(","))
            .map((symbol) => ({
              [symbol]: parser(from, symbol, trans)
            }))
        ))
        .thru((all) =>
          _.spread(_.merge)(all)
        )
        .value()
    )
    .value();
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
  @Validate(AllStatesDeclared, {
    message: "All states must be declared"
  })
  table: FSATransitionTable | PDATransitionTable | TMTransitionTable;

  simulatable: boolean;

  checkSimulatable() {
    switch (this.type) {
      case 'fsa':
        return this.simulatable = true;
      case 'pda': {
        if (this.startStates.length > 1) return false;

        let rst =
          __.chain(<PDATransitionTable>this.table)
            .mapValues((stateObj/*, state*/) =>
              __.chain(stateObj)
                .values()
                .flatten()
                .thru((transs) =>
                  __.chain(_.range(transs.length))
                    .map(i =>
                      __.chain(_.range(i + 1, transs.length))
                        .map(j => {
                          let trans1 = transs[i],
                            trans2 = transs[j];

                          // guaranteed not to be distinguishable by from-state
                          let distinguishedByRead =
                              (   (trans1.read !== trans2.read)
                                && (trans1.read !== this.epsilon && trans2.read !== this.epsilon)
                              ),
                            distinguishedByPop = !isPrefix(trans1.pop, trans2.pop);

                          if ((_.isEqual(trans1, trans2))
                            || distinguishedByPop
                            || distinguishedByRead) return null;
                          else return [trans1, trans2];
                        })
                        .filter(item => _.isArray(item))
                        .map(item => item as PDATransition[])
                        .value()
                    )
                    .flatten()
                    .value()
                )
                .value()
            )
            .pickBy(item => item.length)
            .value();

        let label = (trans: PDATransition) =>
          trans.from + '->' + trans.to + ': ' + trans.read + ', [' + trans.pop + '] ↦ [' + trans.push + ']';
        let pair2str = (pair) => label(pair[0]) + (pair.length > 1 ? " AND " + label(pair[1]) : "");

        console.log("Non deterministic transition pairs in PDA:");
        _.forOwn(rst, (pairs/*, state*/) => {
          _(pairs)
            .forEach(pair => console.log(pair2str(pair)));
        });

        return this.simulatable = _.isEmpty(rst);
      }
      case 'tm': {
        if (this.startStates.length > 1) return false;

        let rst =
          __.chain(<TMTransitionTable>this.table)
            .mapValues((stateObj/*, state*/) =>
              __.chain(stateObj)
                .mapValues((transs, symbol) =>
                  transs.length > 1 ? transs : null
                )
                .values()
                .filter(_.isArray)
                .value()
            )
            .pickBy(item => item.length)
            .value();

        let label = (trans: TMTransition) =>
          trans.from + '->' + trans.to + ': ' + trans.read + '↦' + trans.write + ',' + trans.move;
        let group2str = (groups) => _.map(groups, (trans) => label(trans)).join(' ; ');

        console.log("Non deterministic transition pairs in TM:");
        _.forOwn(rst, (groups/*, state*/) => {
          _(groups)
            .forEach(group => console.log(group2str(group)));
        });

        return this.simulatable = _.isEmpty(rst);
      }
    }
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
