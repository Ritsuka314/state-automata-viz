import _ from "./lodash-mixins";
let __ = _;

import {
  Transition, FSATransition, PDATransition, TMTransition,
  TransitionTable, FSATransitionTable, PDATransitionTable, TMTransitionTable
} from './TransitionSpec';

export function toStringArray (val): string[] {
  if (_.isNil(val))
    return [];
  if (_.isString(val))
    return [val];
  else
    return _.castArray(val).map(String);
}

export function splitToStringArray (val): string[] {
  if (_.isNil(val))
    return [];
  if (_.isString(val))
    return val.split("");
  if (_.isArray(val))
    return val.map(String);
  else
    return String(val).split("");
}

export function isPrefix(arr1, arr2) {
  return _.isEqual(arr1, _.take(arr2, arr1.length))
      || _.isEqual(arr2, _.take(arr1, arr2.length));
}

export type TransitionParser<T extends Transition> =
  (from: string, symbol: string, trans) => T[];

export function parseTable<T extends Transition>(table, parser: TransitionParser<T>): TransitionTable<T> {
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
    .value()
}

export function allStatesInTransitionTableDeclared(table) {
  return __
    .chain(table)
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

export function checkSimulatable(
  type: string,
  startStates: string[],
  epsilon: string,
  table: TransitionTable<Transition>): boolean
{
  switch (type) {
    case 'fsa':
      return true;
    case 'pda': {
      if (startStates.length > 1) return false;

      let rst =
        __.chain(<PDATransitionTable>table)
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
                              && (trans1.read !== epsilon && trans2.read !== epsilon)
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

      return _.isEmpty(rst);
    }
    default /*case 'tm'*/: {
      if (startStates.length > 1) return false;

      let rst =
        __.chain(<TMTransitionTable>table)
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

      return _.isEmpty(rst);
    }
  }
}