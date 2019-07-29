'use strict';

var _ = require('lodash');

/**
 * Construct a Turing machine.
 * @param {(state, symbol) -> ?{state: state, symbol: symbol, move: direction}}
 *   transition
 *   A transition function that, given *only* the current state and symbol,
 *   returns an object with the following properties: symbol, move, and state.
 *   Returning null/undefined halts the machine (no transition defined).
 * @param {state} startState  The state to start in.
 * @param         tape        The tape to use.
 */
function FSA(transition, startStates, acceptStates, epsilonTransition, tape) {
  this.transition = transition;
  // we call this property "state" so it can be consistant with other models when watched
  this.state = startStates;
  this.acceptStates = acceptStates;
  this.epsilonTransition = epsilonTransition;
  this.tape = tape;
}

FSA.prototype.toString = function () {
  return String(this.state) + '\n' + String(this.tape);
};

FSA.prototype.epsilonSteps = function () {
  var eInstructs;
  var seenStates = this.state;
  while ((eInstructs = this.nextEpsilonInstruction).length) {
    var newStates = _.difference(_.flatMap(eInstructs, (instruct) => instruct.state),
                                 seenStates);
    seenStates = _.union(seenStates, newStates);
    this.state = newStates;
  }
  this.state = seenStates;
}

/**
 * Step to the next configuration according to the transition function.
 * @return {boolean} true if successful (the transition is defined),
 *   false otherwise (machine halted)
 */
FSA.prototype.step = function () {
  this.epsilonSteps();
  
  var instructs = this.nextInstruction;
  if (instructs == null) { return false; }
  if (instructs.length == 0) { return false; }
  
  this.state = _.flatMap(instructs, (instruct) => instruct.state);
  
  this.epsilonSteps();
  
  try {
    move(this.tape, MoveHead.right);
  } catch (e) {
    return false;
  }

  return true;
};

Object.defineProperties(FSA.prototype, {
  nextInstruction: {
    get: function () {
      //return this.transition(this.state, this.tape.read());
      return _.filter(_.flatMap(this.state,
                            (s) => this.transition(s, this.tape.read())),
                      (x) => x);
    },
    enumerable: true
  },
  nextEpsilonInstruction: {
    get: function() {
      return _.filter(_.map(this.state,
                            (s) => this.transition(s, this.epsilonTransition)),
                      (x) => x);
    }
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
exports.FSA = FSA;
