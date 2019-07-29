'use strict';
var _ = require('lodash/fp'),
    TMRuntimeError = require("./TMRuntimeError");

// Bounded tape
function BoundedTape(input) {
  // zipper data structure
  // INVARIANTS: tape.before can be empty, tape.after must be nonempty.
  // before: cells before the head (in order; left to right).
  // after:  cells after and including the head (in reverse; right to left).
  this.tape = {
    content: input.slice(),
    head: 0,
    toString: function () {
      return this.content.slice(0, head).join('') + '🔎' + this.content.slice(head).join('');
    }
  };
}

// Read the value at the tape head.
BoundedTape.prototype.read = function () {
  var tape = this.tape,
      head = tape.head;
  if (0 <= head && head < tape.content.length)
    return tape.content[head];
  else
    throw new TMRuntimeError('Read position out of tape boundary.')
};

BoundedTape.prototype.write = function (symbol) {
  var tape = this.tape,
      head = tape.head;
  if (head < 0 || head >= tape.content.length)
    throw IllegalOperationException();
  else
    tape.content[tape.head] = symbol;
};

BoundedTape.prototype.headRight = function () {
  var tape = this.tape;
  if (tape.head + 1 >= tape.content.length)
    throw new TMRuntimeError();
  else
    tape.head++;
};
BoundedTape.prototype.headLeft = function () {
  var tape = this.tape;
  if (tape.head - 1 < 0) 
    throw new TMRuntimeError();
  else
    tape.head--;
};

BoundedTape.prototype.toString = function () {
  return this.tape.toString();
};

// for tape visualization. not part of TM definition.
// Read the value at an offset from the tape head.
// 0 is the tape head. + is to the right, - to the left.
BoundedTape.prototype.readOffset = function (i) {
  var tape = this.tape,
      head = tape.head;
  if (0 <= head + i && head + i < tape.content.length) {
    // Within tape
    return tape.content[head+i];
  } else {
    // outside of tape
    return null;
  }
};

// for tape visualization.
// Read the values from an offset range (inclusive of start and end).
BoundedTape.prototype.readRange = function (start, end) {
  return _.range(start, end+1).map(function (i) {
    return this.readOffset(i);
  }, this);
};

module.exports = BoundedTape;
