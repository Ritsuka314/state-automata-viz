'use strict';

import * as jsyaml from "js-yaml";
export { YAMLException } from "js-yaml";

import {Exclude, Expose, plainToClass, Transform} from "class-transformer";
import "reflect-metadata";

//import * as _ from 'lodash';
import _ from './lodash-mixins';
//let __ = _;

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

// type Synonyms<T> = {[id: string]: T[]};

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
      _
      .chain(stateObject)
      .values()
      .flatten()
      .map(transition => transition.to)
      .value()
    )
    .every(state =>
      _
      .chain(table)
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
  @Transform((val, obj, type) => {
    console.log(val, obj, type);
    return _.chain(val)
    .mapKeys((val, key) => String(key))
    .mapValues((outTrans, from) =>
      _.chain(outTrans)
       .toPairs()
       .flatMap(_.spread((symbols, trans) =>
         _.castArray(String(symbols).split(","))
          .map((symbol) => ({
            [symbol]:
              match(makeType(obj.type))
              .on(_.matches('fsa'), () =>
                _.castArray(trans || from)
                .map(String)
                .map((state): FSATransition =>
                  ({
                    from: from,
                    read: symbol,
                    to: state
                  })
                )
              )
              .on(_.matches('pda'), () =>
                _.castArray(trans || {})
                .map((trans): PDATransition =>
                  ({
                    from: from,
                    read: symbol,
                    pop: _.castArray(trans.pop || []).map(String),
                    push: _.castArray(trans.push || []).map(String),
                    to: String(trans.state || from)
                  })
                )
              )
              .otherwise(/*_.matches('tm'), */() =>
                _.castArray(trans || {})
                .map((trans): TMTransition =>
                  ({
                    from: from,
                    read: symbol,
                    to: String(trans.state || from),
                    write: String(trans.write || symbol),
                    move: String(trans.move || 'S')
                  })
                )
                .map((trans) => {
                  console.log(trans);
                  console.log(_.contains(['L', 'R', 'S'], trans.move));
                  if (_.contains(['L', 'R', 'S'], trans.move))
                    return trans;
                  else
                    throw new TMSpecError('Illegal move', {
                      problemValue: trans.move
                    });
                })
              )
          }))
       ))
       .thru((all) =>
         _.spread(_.merge)(all)
       )
       .value()
    )
    .value();
  })
  @Validate(AllStatesDeclared, {
    message: "All states must be declared"
  })
  table: FSATransitionTable | PDATransitionTable | TMTransitionTable;

  simulatable: boolean;

  checkSimilatable() {
    switch (this.type) {
      case 'fsa':
        return this.simulatable = true;
      case 'pda': {
        if (this.startStates.length > 1) return false;

        let rst =
          _
          .chain(<PDATransitionTable>this.table)
          .mapValues((stateObj/*, state*/) =>
              _
              .chain(stateObj)
              .values()
              .flatten()
              .thru((transs) =>
                  _
                  .chain(_.range(transs.length))
                  .map(i =>
                      _
                      .chain(_.range(i + 1, transs.length))
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
          _
          .chain(<TMTransitionTable>this.table)
          .mapValues((stateObj/*, state*/) =>
            _
            .chain(stateObj)
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
  spec.checkSimilatable();
  console.log(util.inspect(spec, false, null, true));

  let es = validateSync(spec);
  console.log(util.inspect(es, false, null, true));
  if (es.length) throw new TMSpecError('Validation Error', {
    validationErrors: es
  });

  return spec;
}
