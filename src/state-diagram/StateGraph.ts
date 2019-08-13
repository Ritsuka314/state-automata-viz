'use strict';

import _ from '../lodash-mixins';
import {FSATransition, PDATransition, TMTransition, Transition, TransitionTable} from '../parser';

interface Vertex<T extends Transition> extends SimulationNodeDatum {
  label: string,
  outTrans: {
    [symbol: string]: {
      transition: T[],
      edge: LayoutEdge<T>
    }
  }
}

interface VertexLUT<T extends Transition> {
  [state: string]: Vertex<T>
}

import { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
// SimulationLinkDatum<NodeDatum extends SimulationNodeDatum>
interface LayoutEdge<T extends Transition> extends SimulationLinkDatum<Vertex<T>> { labels: string[] }

type Graph<T extends Transition> = {vertices: VertexLUT<T>, edges: LayoutEdge<T>[]};

/**
 * Use a transition table to derive the graph (vertices & edges) for a D3 diagram.
 * Edges with the same source and target are combined.
 * NB. In addition to single symbols, comma-separated symbols are supported.
 * e.g. symbol string '0,1,,,I' -> symbols [0,1,',','I'].
 */
// TransitionTable -> DiagramGraph
function deriveGraph<T extends Transition>(table: TransitionTable<T>, type: string): Graph<T> {
  // forward declaration
  let labelFor;
  if (type === "fsa")
    labelFor = labelFor_FSA;
  else if (type === "pda")
    labelFor = labelFor_PDA;
  else// if (type === "tm")
    labelFor = labelFor_Tape;

  // We need two passes, since edges may point at vertices yet to be created.
  // 1. Create all the vertices.
  let vertices: VertexLUT<T> = _.mapValues(table, function (transitions, state) {
    return {
      label: state,
      outTrans: {}
    };
  });

  // 2. Create the edges, which can now point at any vertex object.
  let edges = [];
  _.forEach(vertices, function (vertex, state) {

    vertex.outTrans = vertex.outTrans && (function () {
      let stateTransitions: typeof vertex.outTrans = {};

      // Combine edges with the same source and target
      let cache: {[to: string]: LayoutEdge<T>} = {};
      function edgeTo(target: string, label: string): LayoutEdge<T> {
        let edge = cache[target] ||
          _.tap(cache[target] = {
            source: vertex,
            target: vertices[target],
            labels: []
          }, edges.push.bind(edges));
        edge.labels.push(label);
        return edge;
      }

      // Create symbol -> instruction object map
      _.forEach(table[state], function (instructs, symbolKey) {
        _.forEach(_.castArray(instructs), (instruct) => {
          let edge = edgeTo(instruct.to, labelFor(instruct));

          stateTransitions[instruct.read] = {
            transition: instructs,
            edge: edge
          };
        });
      });

      return stateTransitions;
    }());

  });

  return {vertices: vertices, edges: edges};
}

function labelFor_FSA(trans: FSATransition): string {
  return trans.read;
}

function labelFor_PDA(trans: PDATransition): string {
  return trans.read + ', [' + trans.pop.join(',') + '] ↦ [' + trans.push.join(',') + ']';
}

function labelFor_Tape(trans: TMTransition): string {
  return visibleSpace(trans.read) + '→' + visibleSpace(trans.write) + ',' + trans.move;
}

// replace ' ' with '␣'.
function visibleSpace(c) {
  return (c === ' ') ? '␣' : c;
}


/**
 * Aids rendering and animating a transition table in D3.
 *
 * • Generates the vertices and edges ("nodes" and "links") for a D3 diagram.
 * • Provides mapping of each state to its vertex and each transition to its edge.
 * @param {TransitionTable} table
 */
class StateGraph<T extends Transition> {
  private readonly derived: Graph<T>;

  constructor (table, type) {
    this.derived = deriveGraph(table, type);
  }

  get __vertices() {
    return this.derived.vertices;
  }

  get __edges() {
    return this.derived.edges;
  }

  /**
   * D3 layout "nodes".
   */
  // getVertices () {
  //   return _.values(this.__vertices);
  // };

  /**
   * Returns the mapping from states to vertices (D3 layout "nodes").
   * @return { {[state: string]: Object} }
   */
  public getVertexMap () {
    return this.__vertices;
  };

  /**
   * D3 layout "links".
   */
  getEdges () {
    return this.__edges;
  };

  /**
   * Look up a state's corresponding D3 "node".
   */
  getVertex (state) {
    return this.__vertices[state];
  };

  getInstructionAndEdge (state, symbol) {
    let vertex = this.__vertices[state];
    if (vertex === undefined) {
      throw new Error('not a valid state: ' + String(state));
    }

    return vertex.outTrans && vertex.outTrans[symbol];
  };
}

export = StateGraph;