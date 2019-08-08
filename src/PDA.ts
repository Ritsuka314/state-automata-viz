'use strict';

let TMRuntimeError = require("./tape/TMRuntimeError");
import _ from './lodash-mixins';
import { PDATransition } from './parser';
import { TransitionLUT, StateAutomaton } from "./StateAutomaton";

type PDATransitionLUT = TransitionLUT<PDATransition>;

export default class PDA extends StateAutomaton<PDATransition> {
  private readonly transition: PDATransitionLUT;
  public states: string[];
  private readonly acceptStates: string[];
  private readonly tape;
  private readonly stack;

  /**
   * Construct a Pushdown Automaton.
   * @param transition
   *   A transition function that, given *only* the current state and symbol,
   *   returns an object with the following properties: symbol, move, and state.
   *   Returning null/undefined halts the machine (no transition defined).
   * @param startStates  The states to start in.
   * @param acceptStates
   * @param tape         The tape to use.
   * @param stack        The stack to use.
   */
  constructor (transition: PDATransitionLUT, startStates, acceptStates, tape, stack) {
    super();

    this.transition = transition;
    this.states = startStates;
    this.acceptStates = acceptStates;
    this.tape = tape;
    this.stack = stack;
  }

  public toString (): string {
    return this.states.join(', ') + '\n' + String(this.tape) + '\n' + String(this.stack);
  };

  private onStack (s: string[]): boolean {
    return _.isEqual(_.takeRight(this.stack, s.length), s);
  }

  public step (): boolean {
    let instructs = _(this.nextInstruction)
    .filter(instruct => this.stack.isOn(instruct.pop))
    .value();
    // reject
    if (instructs.length == 0) { return false; }
    // nondeterministic
    else if (instructs.length > 1) {
      throw new TMRuntimeError("Cannot simulate nondeterministic step",
        "Transitions from state " + this.states + ": " + JSON.stringify(instructs));
    }

    let instruct = instructs[0];
    this.stack.pop(instruct.pop.length);
    this.stack.push(instruct.push);
    this.states = [instruct.to];
    try {
      this.tape.headRight();
    } catch (e) {
      return false;
    }
    return true;
  };

  public get nextInstruction(): PDATransition[] {
    return _.chain(this.states)
    .flatMap((s) => this.transition(s, this.tape.read()))
    .filter(_.identity())
    .value();
  }

  public get isHalted(): boolean { return this.nextInstruction.length == 0; }
}