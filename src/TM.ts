'use strict';

let TMRuntimeError = require("./tape/TMRuntimeError");
import _ from './lodash-mixins';
import { TMTransition } from './TransitionSpec';
import { TransitionLUT, StateAutomaton } from "./StateAutomaton";

type TMTransitionLUT = TransitionLUT<TMTransition>;

export default class TM extends StateAutomaton<TMTransition> {
  private readonly transition: TMTransitionLUT;
  public states: string[];
  private readonly acceptStates: string[];
  private readonly tape;

  /**
   * Construct a Turing machine.
   * @param transition
   *   A transition function that, given *only* the current state and symbol,
   *   returns an object with the following properties: symbol, move, and state.
   *   Returning null/undefined halts the machine (no transition defined).
   * @param startStates  The states to start in.
   * @param acceptStates
   * @param tape         The tape to use.
   */
  constructor (transition: TMTransitionLUT, startStates, acceptStates, tape) {
    super();

    this.transition = transition;
    this.states = startStates;
    this.acceptStates = acceptStates;
    this.tape = tape;
  }

  toString () {
    return this.states.join(', ') + '\n' + String(this.tape);
  };

  // Allows for both notational conventions of moving the head or moving the tape
  private move(direction) {
    switch (direction) {
      case 'R': this.tape.headRight(); break;
      case 'L': this.tape.headLeft();  break;
      case 'S': break;
      default: throw new TypeError('not a valid tape movement: ' + String(direction));
    }
  }

  public step () {
    let instructs = this.nextInstruction;
    if (instructs == null) { return false; }
    if (instructs.length == 0) { return false; }
    if (instructs.length > 1) {
      throw TMRuntimeError("Cannot simulate nondeterministic TM");
    }

    let instruct = instructs[0];

    this.tape.write(instruct.write);
    this.move(instruct.move);
    this.states = [instruct.to];

    return true;
  };

  get nextInstruction (): TMTransition[] {
    return _.chain(this.states)
    .flatMap((s) => this.transition(s, this.tape.read()))
    .filter(_.identity())
    .value();
  }

  get isHalted (): boolean { return this.nextInstruction == null; }

}
