'use strict';
/**
 * Turing machine visualization component.
 *
 * • Adds running and reset on top of the base Turing machine.
 * • Displays an animated state diagram and tape diagram.
 * Does not include UI elements for controlling the machine.
 *
 * @module
 */

var TuringMachine = require('./TM.ts').default,
    PDA = require('./PDA.ts').default,
    FSA = require('./FSA.ts').default,
    TapeViz = require('./tape/TapeViz'),
    BoundedTapeViz = require('./tape/BoundedTapeViz'),
    StackViz = require('./tape/StackViz'),
    StateGraph = require('./state-diagram/StateGraph'),
    StateViz = require('./state-diagram/StateViz'),
    watchInit = require('./watch').watchInit,
    d3 = require('d3'),
    _ = require('lodash/fp');

/**
 * Create an animated transition function.
 * @param  {StateGraph} graph
 * @param  {LayoutEdge -> any} animationCallback
 * @return {(string, string) -> Instruction} Created transition function.
 */
function animatedTransition(graph, animationCallback) {
  return function (state, symbol) {
    var tuple = graph.getInstructionAndEdge(state, symbol);
    if (tuple == null) { return null; }
    //else if (tuple instanceof Array) {
    //  _.each(tuple, (t) => animationCallback(t.edge));
    //  return _.map(tuple, (t) => t.instruction);
    //}
    else {
      if (tuple.edge instanceof Array)
        _.each((edge) => animationCallback(edge))
              (tuple.edge);
      else
        animationCallback(tuple.edge);
      return tuple.transition;
    }
  };
}

/**
 * Default edge animation callback.
 * @param  {{domNode: Node}} edge
 * @return {D3Transition} The animation. Use this for transition chaining.
 */
function pulseEdge(edge) {
  var edgepath = d3.select(edge.domNode);
  return edgepath
      .classed('active-edge', true)
    .transition()
      .style('stroke-width', '3px')
    .transition()
      .style('stroke-width', '1px')
    .transition()
      .duration(0)
      .each('start', /* @this edge */ function () {
        d3.select(this).classed('active-edge', false);
      })
      .style('stroke', null)
      .style('stroke-width', null);
}

function addBoundedTape(div, spec) {
  return new BoundedTapeViz(div.append('svg').attr('class', 'bounded-tape'), 9,
    spec.input);
}

function addStack(div) {
  return new StackViz(div.append('svg').attr('class', 'stack'), 9,
    []);
}

function addTape(div, spec) {
  return new TapeViz(div.append('svg').attr('class', 'tm-tape'), 9,
    spec.blank, spec.input);
}

/**
 * Construct a new state and tape visualization inside a &lt;div&gt;.
 * @constructor
 * @param {HTMLDivElement} div        div to take over and use.
 * @param                  spec       machine specification
 * @param {PositionTable} [posTable]  position table for the state nodes
 */
function TMViz(div, spec, posTable) {
  div = d3.select(div);
  var graph = new StateGraph(spec.table, spec.type);
  this.stateviz = new StateViz(
    div,
    graph.getVertexMap(),
    graph.getEdges(),
    spec.startStates,
    spec.acceptStates
  );
  if (posTable != undefined) { this.positionTable = posTable; }

  if (!spec.simulatable) {
    this.step = () => {};
    this.reset = () => {};
  }
  else {
    // no need to to these if not simulatable
    
    this.edgeAnimation = pulseEdge;
    this.stepInterval = 100;

    var self = this;
    // lock: collection of edges
    // only last edge taken in step can continue next step in running mode
    var transitionsTaking = [];
    // We hook into the animation callback to know when to start the next step (when running).
    function animateAndContinue(edge) {
      var transition = self.edgeAnimation(edge);
      if (self.isRunning) {
        // lock
        transitionsTaking = _.union(transitionsTaking, [edge]);

        transition.transition().duration(self.stepInterval).each('end', function () {
          // unlock
          transitionsTaking = _.without(transitionsTaking, [edge]);

          // stop if machine was paused during the animation
          if (self.isRunning && transitionsTaking.length === 0) { self.step(); }
        });
      }
    }

    if (spec.type === "fsa")
      this.machine = new FSA(
        animatedTransition(graph, animateAndContinue),
        spec.startStates,
        spec.acceptStates,
        spec.epsilonTransition,
        addBoundedTape(div, spec)
      );
    else if (spec.type === "pda")
      this.machine = new PDA(
        animatedTransition(graph, animateAndContinue),
        spec.startStates,
        spec.acceptStates,
        addBoundedTape(div, spec),
        addStack(div)
      );
    else if (spec.type === "tm")
      this.machine = new TuringMachine(
        animatedTransition(graph, animateAndContinue),
        spec.startStates,
        spec.acceptStates,
        addTape(div, spec)
      );
    // intercept and animate when the state is set
    watchInit(this.machine, 'states', function (prop, oldstate, newstate) {
      if (oldstate instanceof Array)
        _.each((oldstate) =>
          d3.select(graph.getVertex(oldstate).domNode).classed('current-state', false),
          oldstate);
      else
        d3.select(graph.getVertex(oldstate).domNode).classed('current-state', false);

      if (newstate instanceof Array)
        _.each((newstate) =>
          d3.select(graph.getVertex(newstate).domNode).classed('current-state', true),
          newstate);
      else
        d3.select(graph.getVertex(newstate).domNode).classed('current-state', true);

      return newstate;
    });

    // Sidenote: each "Step" click evaluates the transition function once.
    // Therefore, detecting halting always requires its own step (for consistency).
    this.isHalted = false;

    var isRunning = false;
    /**
     * Set isRunning to true to run the machine, and false to stop it.
     */
    Object.defineProperty(this, 'isRunning', {
      configurable: true,
      get: function () { return isRunning; },
      set: function (value) {
        if (isRunning !== value) {
          isRunning = value;
          if (isRunning) { this.step(); }
        }
      }
    });
  }

  this.error = null;
  this.__parentDiv = div;
  this.__spec = spec;
}

/**
 * Step the machine immediately and interrupt any animations.
 */
TMViz.prototype.step = function () {
  var rst = _.attempt(() => this.machine.step() /*to keep `this`*/);
  if (rst === false || _.isError(rst)) {
    this.isRunning = false;
    this.isHalted = true;
    if (_.isError(rst))
      this.error = rst;
  }
};

/**
 * Reset the Turing machine to its starting configuration.
 */
TMViz.prototype.reset = function () {
  this.isRunning = false;
  this.isHalted = false;
  this.error = null;
  this.machine.states = this.__spec.startStates;
  this.machine.tape.domNode.remove();
  if (this.machine instanceof FSA)
    this.machine.tape = addBoundedTape(this.__parentDiv, this.__spec);
  else if (this.machine instanceof PDA) {
    this.machine.tape = addBoundedTape(this.__parentDiv, this.__spec);
    this.machine.stack.domNode.remove();
    this.machine.stack = addStack(this.__parentDiv); 
  }
  else if (this.machine instanceof TuringMachine)
    this.machine.tape = addTape(this.__parentDiv, this.__spec);
};

Object.defineProperty(TMViz.prototype, 'positionTable', {
  get: function ()  { return this.stateviz.positionTable; },
  set: function (posTable) { this.stateviz.positionTable = posTable; }
});

module.exports = TMViz;
