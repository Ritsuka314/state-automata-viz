'use strict';

var _ = require('lodash'),
    TMRuntimeError = require('./tape/TMRuntimeError');

/**
 * Construct a Turing machine.
 * @param {(state, symbol) -> ?{state: state, symbol: symbol, move: direction}}
 *   transition
 *   A transition function that, given *only* the current state and symbol,
 *   returns an object with the following properties: symbol, move, and state.
 *   Returning null/undefined halts the machine (no transition defined).
 * @param {state} startStates  The state to start in.
 * @param         tape        The tape to use.
 */
function PDA(transition, startStates, acceptStates, tape, stack) {
  this.transition = transition;
  this.state = startStates;
  this.acceptStates = acceptStates;
  this.tape = tape;
  this.stack = stack;
}

PDA.prototype.toString = function () {
  return String(this.state) + '\n' + String(this.tape);
};

PDA.prototype.onStack = function(s) {
  return _.isEqual(_.takeRight(this.stack, s.length), s);
}

/**
 * Step to the next configuration according to the transition function.
 * @return {boolean} true if successful (the transition is defined),
 *   false otherwise (machine halted)
 */
PDA.prototype.step = function () {
  var instructs = _(this.nextInstruction)
    .filter(instruct => this.stack.isOn(instruct.pop))
    .value();
  // reject
  if (instructs.length == 0) { return false; }
  // nondeterministic
  if (instructs.length > 1) {
    throw new TMRuntimeError("Cannot simulate nondeterministic step",
      "Transitions from state " + this.state + ": " + JSON.stringify(instructs));
  }

  var instruct = instructs[0];
  this.stack.pop(instruct.pop.length);
  this.stack.push(instruct.push);
  this.state = instruct.state;
  try {
    move(this.tape, MoveHead.right);
  } catch (e) {
    return false;
  }
  return true;
};

Object.defineProperties(PDA.prototype, {
  nextInstruction: {
    get: function () {
      return this.transition(this.state, this.tape.read());
    },
    enumerable: true
  },
  isHalted: {
    get: function () { return this.nextInstruction.length == 0; },
    enumerable: true
  }
});

// Allows for both notational conventions of moving the head or moving the tape
function move(tape, direction) {
  switch (direction) {
    case MoveHead.right: tape.headRight(); break;
    case MoveHead.left:  tape.headLeft();  break;
    default: throw new TypeError('not a valid tape movement: ' + String(direction));
  }
}
var MoveHead = Object.freeze({
  left:  {toString: function () { return 'L'; } },
  right: {toString: function () { return 'R'; } }
});
var MoveTape = Object.freeze({left: MoveHead.right, right: MoveHead.left});

exports.MoveHead = MoveHead;
exports.MoveTape = MoveTape;
exports.PDA = PDA;
