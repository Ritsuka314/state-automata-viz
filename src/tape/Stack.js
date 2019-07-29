'use strict';
var _ = require('lodash/fp'),
    TMRuntimeError = require("./TMRuntimeError");

// Bounded tape
function Stack(input) {
  // zipper data structure
  // INVARIANTS: tape.before can be empty, tape.after must be nonempty.
  // before: cells before the head (in order; left to right).
  // after:  cells after and including the head (in reverse; right to left).
  this.content = input.slice()
}

// Read the value at the tape head.
Stack.prototype.isOn = function (s) {
  return _.isEqual(_.takeRight(s.length)(this.content), s);
};

Stack.prototype.pop = function(l) {
  if (this.content.length < l) {
    throw new TMRuntimeError("Poping from empty stack.");
  }
  else if (l) {
    this.content = _.slice(0)(this.content.length - l)(this.content);
  }
}

Stack.prototype.push = function (s) {
  this.content = this.content.concat(s);
}

Stack.prototype.toString = function () {
  return this.content.slice().join('');
};

// for tape visualization. not part of TM definition.
// Read the value at an offset from the tape head.
// 0 is the tape head. + is to the right, - to the left.
Stack.prototype.readOffset = function (i) {
  var content = this.content;
  if (i < 0) {
    // space
    return [];
  } else if (i >= content.length) {
    // outsite
    return null;
  } else {
    // Within tape
    return content[content.length-1-i];
  }
};

// for tape visualization.
// Read the values from an offset range (inclusive of start and end).
Stack.prototype.readRange = function (start, end) {
  return _.range(start, end).map(function (i) {
    return this.readOffset(i);
  }, this);
};

module.exports = Stack;
