'use strict';
var Stack = require('./Stack.js'),
    d3   = require('d3');
require('./tape.css');

var cellWidth = 50;
var cellHeight = 50;

    
function initTapeCells(selection) {
  selection.attr('class', 'tape-cell');
  selection.append('rect')
      // the box outline is purely visual, so remove its data binding
      .attr('hidden', (d) => {
        return d == null ? "hidden" : null })
      .style('opacity', (d) => {
        return d == null ? 0 : null })
      .style('stroke', (d) => {
        return _.isEqual(d)([]) ? "grey" : null})
      .datum(null)
      .attr({'width': cellWidth,
             'height': cellHeight});
  selection.append('text')
      .text(function (d) { return d; })
      .attr({'x': cellWidth/2, 'y': cellHeight/2 + 8});
  return selection;
}

function positionCells(selection, offset) {
  offset = (offset == null) ? 0 : offset;
  selection.attr('transform', function (d, i) {
    return 'translate(' + (-cellWidth+10 + cellWidth*(i+offset)) + ')';
  });
  return selection;
}

function repositionWrapper(wrapper) {
  wrapper.attr('transform', 'translate(0 10)')
    .transition()
      .duration(0)
    .select('.exiting')
      .remove();
}

// Tape visualization centered around the tape head.
function StackViz(svg, lookaround, input) {
  Stack.call(this, input);

  Object.defineProperty(this, 'lookaround', {
    value: lookaround,
    writable: false,
    enumerable: true
  });
  Object.defineProperty(this, 'domNode', {
    value: svg,
    writable: false,
    enumerable: true
  });

  // width is before + head + after, trimming 2 off to show cut-off tape ends
  var width  = cellWidth * (lookaround+1+lookaround-2) + 2*10;
  var height = cellHeight + 2*10;
  svg.attr({
    'width': '95%',
    'viewBox': [0, 0, width, height].join(' ')
  });

  this.wrapper = svg.append('g')
      .attr('class', 'wrapper')
      .call(repositionWrapper);

  this.redraw();
}

StackViz.prototype = Object.create(Stack.prototype);
StackViz.prototype.constructor = Stack;

StackViz.prototype.redraw = function () {
  this.wrapper.selectAll('.tape-cell').remove();
  this.wrapper.selectAll('.tape-cell')
      .data(this.readRange(this.lookaround*2-3-1, -3-1))
    .enter()
    .append('g')
      .call(initTapeCells)
      .call(positionCells)
  ;
}

StackViz.prototype.pop = function (l) {
  Stack.prototype.pop.call(this, l);
  this.redraw();
};

StackViz.prototype.push = function (s) {
  Stack.prototype.push.call(this, s);
  this.redraw();
};

module.exports = StackViz;
