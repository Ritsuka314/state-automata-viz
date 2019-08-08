'use strict';

import _ from './lodash-mixins';
import { FSATransition } from './parser';
import { TransitionLUT, StateAutomaton } from "./StateAutomaton";

type FSATransitionLUT = TransitionLUT<FSATransition>;

export default class FSA extends StateAutomaton<FSATransition> {
  private readonly transition: FSATransitionLUT;
  public states: string[];
  private readonly acceptStates: string[];
  private readonly epsilonTransition: string;
  private readonly tape;

  /**
   * Construct a Finite State Automaton.
   * @param transition
   *   A transition function that, given *only* the current state and symbol,
   *   returns an object with the following properties: symbol, move, and state.
   *   Returning null/undefined halts the machine (no transition defined).
   * @param startStates  The states to start in.
   * @param acceptStates
   * @param epsilonTransition
   * @param tape         The tape to use.
   */
  constructor (transition: FSATransitionLUT, startStates, acceptStates, epsilonTransition, tape) {
    super();

    this.transition = transition;
    this.states = startStates;
    this.acceptStates = acceptStates;
    this.epsilonTransition = epsilonTransition;
    this.tape = tape;
  }

  public toString(): string {
    return this.states.join(', ') + '\n' + String(this.tape);
  };

  private epsilonSteps(): void {
    let eInstructs;
    let seenStates = this.states;
    while ((eInstructs = this.nextEpsilonInstruction).length) {
      let newStates = _.difference(_.flatMap(eInstructs, (instruct) => instruct.state),
        seenStates);
      seenStates = _.union(seenStates, newStates);
      this.states = newStates;
    }
    this.states = seenStates;
  }

  public step (): boolean {
    this.epsilonSteps();

    let instructs = this.nextInstruction;
    if (instructs == null) { return false; }
    if (instructs.length == 0) { return false; }

    this.states = _.flatMap(instructs, (instruct) => instruct.to);

    this.epsilonSteps();

    try {
      this.tape.headRight();
    } catch (e) {
      return false;
    }

    return true;
  };

  private get nextInstruction(): FSATransition[] {
    return _.chain(this.states)
    .flatMap((s) => this.transition(s, this.tape.read()))
    .filter(_.identity())
    .value();
  }

  private get nextEpsilonInstruction(): FSATransition[] {
    return _.chain(this.states)
    .flatMap((s) => this.transition(s, this.epsilonTransition))
    .filter(_.identity())
    .value();
  }

  public get isHalted(): boolean {
    return this.nextInstruction.length == 0;
  }
}