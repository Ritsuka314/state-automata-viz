let assert = require('assert');
import { parseSpec } from '../src/parser';
import { stripIndent } from 'common-tags';
import * as _ from "lodash";

import {Exclude, Expose, classToPlain, plainToClass} from "class-transformer";

describe('Parser', function() {
  describe('parse', function() {
    describe('type', function() {
      it('legal', function () {
        let str = stripIndent`
          type: fsa
          `;
        let spec = parseSpec(str);
        assert.strictEqual(spec.type, 'fsa');
      });

      it('null', function () {
        let str = stripIndent`
          type:
          blank: " "
          `;
        let spec = parseSpec(str);
        assert.strictEqual(spec.type, 'tm');
      });

      it('undefined', function () {
        let str = stripIndent`
          blank: " "
          `;
        let spec = parseSpec(str);
        assert.strictEqual(spec.type, 'tm');
      });

      it('illegal', function () {
        let str = stripIndent`
          type: foo
          `;

        assert.throws(() => parseSpec(str), _.conforms({
            name: _.partial(_.isEqual, 'TMSpecError'),
            reason: _.partial(_.isEqual, 'Validation Error'),
            details: _.conforms({
              info: (lst) => _.find(lst, _.conforms({
                constraints: _.conforms({
                  isIn: _.partial(_.isEqual, 'Automaton must be of type ["fsa","pda","tm"]')
                })
              }))
            })
          })
        );
      });
    });

    describe('FSA', function() {
      describe('start/accept states', function() {
        it('array', function () {
          let str = stripIndent`
          start states: ["a", "b"]
          accept states: []
          type: fsa
          table:
            a:
            b:
          `;
          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.startStates, ['a', 'b']);
          assert.deepStrictEqual(spec.acceptStates, []);
        });

        it('string', function () {
          let str = stripIndent`
          start states: "abc"
          accept states: ""
          type: fsa
          table:
            abc:
            "": 
          `;
          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.startStates, ['abc']);
          assert.deepStrictEqual(spec.acceptStates, ['']);
        });

        it('non string', function () {
          let str = stripIndent`
          start states: 1
          accept states: true
          type: fsa
          table:
            1:
            'true': 
          `;
          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.startStates, ['1']);
          assert.deepStrictEqual(spec.acceptStates, ['true']);
        });

        it('null', function () {
          let str = stripIndent`
          start states: 
          type: fsa
          `;
          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.startStates, []);
        });

        it('undefined', function () {
          let str = stripIndent`
          accept states:
          type: fsa
          `;
          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.startStates, []);
        });
      });

      describe('input', function() {
        it('string', function () {
          let str = stripIndent`
          input: aabbcc
          type: fsa
          `;
          let spec = parseSpec(str);
          assert.deepEqual(spec.input, "aabbcc".split(""));
        });

        it('non string', function () {
          let str = stripIndent`
          input: 11000
          type: fsa
          `;
          let spec = parseSpec(str);
          assert.deepEqual(spec.input, "11000".split(""));
        });

        it('array', function () {
          let str = stripIndent`
          input: ["a", "b"]
          type: fsa
          `;
          let spec = parseSpec(str);
          assert.deepEqual(spec.input, "ab".split(""));
        });

        it('null', function () {
          let str = stripIndent`
          input: 
          type: fsa
          `;
          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.input, []);
        });

        it('undefined', function () {
          let str = stripIndent`
          type: fsa
          `;
          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.input, []);
        });

      });

      describe("transition table", function () {
        it('regular', function () {
          let str = stripIndent`
            type: fsa
            table:
              A:
                0: A
                1: A
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table, {
            A: {
              '0': [{from: 'A', read: '0', to: 'A'}],
              '1': [{from: 'A', read: '1', to: 'A'}]
            }
          });
        });

        it('multiple symbols', function () {
          let str = stripIndent`
            type: fsa
            table:
              A:
                [0, a]: A
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table, {
            A: {
              '0': [{ from: 'A', read: '0', to: 'A' }],
              'a': [{ from: 'A', read: 'a', to: 'A' }]
            }
          })
        });

        it('multiple destinations', function () {
          let str = stripIndent`
            type: fsa
            table:
              A:
                0: [A, B]
              B:
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table, {
            'A': {
              '0': [{ from: 'A', read: '0', to: 'A' },
                    { from: 'A', read: '0', to: 'B' }]
              },
            B: {}
          });
        });

        it('null transition', function () {
          let str = stripIndent`
            type: fsa
            table:
              A:
                0:
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table, {
            'A': {
              '0': [{ from: 'A', read: '0', to: 'A' }]
            }
          });
        });

        it('undeclared start state', function () {
          let str = stripIndent`
            type: fsa
            start states: B
            table:
              A:
            `;

          assert.throws(() => parseSpec(str), _.conforms({
              name: _.partial(_.isEqual, 'TMSpecError'),
              reason: _.partial(_.isEqual, 'Validation Error'),
              details: _.conforms({
                info: (lst) => _.find(lst, _.conforms({
                  constraints: _.conforms({
                    StatesDeclared: _.partial(_.isEqual, 'All start states must be declared')
                  })
                }))
              })
            })
          );
        });

        it('undeclared state', function () {
          let str = stripIndent`
            type: fsa
            start states: A
            table:
              A: B
            `;

          assert.throws(() => parseSpec(str), _.conforms({
              name: _.partial(_.isEqual, 'TMSpecError'),
              reason: _.partial(_.isEqual, 'Validation Error'),
              details: _.conforms({
                info: (lst) => _.find(lst, _.conforms({
                  constraints: _.conforms({
                    AllStatesDeclared: _.partial(_.isEqual, 'All states must be declared')
                  })
                }))
              })
            })
          );
        });
      });

      describe("epsilon", function () {
        it('undefined', function () {
          let str = stripIndent`
            type: fsa
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.epsilon, '');
        });

        it('null', function () {
          let str = stripIndent`
            epsilon:
            type: fsa
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.epsilon, '');
        });

        it('legal', function () {
          let str = stripIndent`
            epsilon: 'e'
            type: fsa
            `;

          assert.doesNotThrow(() => {
            let spec = parseSpec(str);
            assert.deepStrictEqual(spec.epsilon, 'e');
          });
        });

        it('epsilon in input', function () {
          let str = stripIndent`
            input: 'abcde'
            epsilon: 'e'
            type: fsa
            `;

          assert.throws(() => parseSpec(str), _.conforms({
              name: _.partial(_.isEqual, 'TMSpecError'),
              reason: _.partial(_.isEqual, 'Validation Error'),
              details: _.conforms({
                info: (lst) => _.find(lst, _.conforms({
                  constraints: _.conforms({
                    EpsilonNotInInput: _.partial(_.isEqual, 'input string cannot contain the epsilon symbol')
                  })
                }))
              })
            })
          );
        });
      });
    });

    describe('PDA', function() {
      describe('transition table', function() {
        it('regular', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: {push: i, pop: j, state: A}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: ['i'], pop: ['j'], to: 'A' }]
            }
          });
        });

        it('null transition', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0:
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: [], pop: [], to: 'A' }]
            }
          });
        });

        it('state undefined', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: {push: i, pop: j}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: ['i'], pop: ['j'], to: 'A' }]
            }
          });
        });

        it('state null', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: {push: i, pop: j, state:}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: ['i'], pop: ['j'], to: 'A' }]
            }
          });
        });

        it('non string state', function () {
          let str = stripIndent`
            type: pda
            table:
              1:
                0: {push: i, pop: j, state: 1}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            '1': {
              '0': [{ from: '1', read: '0', push: ['i'], pop: ['j'], to: '1' }]
            }
          });
        });

        it('push undefined', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: {pop: j, state: A}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: [], pop: ['j'], to: 'A' }]
            }
          });
        });

        it('push null', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: {push: , pop: j, state: A}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: [], pop: ['j'], to: 'A' }]
            }
          });
        });

        it('non string push', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: {push: 1, pop: j, state: A}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: ['1'], pop: ['j'], to: 'A' }]
            }
          });
        });

        it('array push', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: {push: [i, i], pop: j, state: A}
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: ['i', 'i'], pop: ['j'], to: 'A' }]
            }
          });
        });

        it('multiple', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: [{pop: i, state: A}, {state: A}]
            `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', push: [], pop: ['i'], to: 'A' },
                    { from: 'A', read: '0', push: [], pop: [], to: 'A' }]
            }
          });
        });
      });

      describe('non deterministic transitions', function() {
        it('pop does not distinguish', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: [{pop: [i]}, {pop: [i, i]}]
            `;

          let spec = parseSpec(str);
          assert(!spec.simulatable);
        });

        it('pop distinguishes', function () {
          let str = stripIndent`
            type: pda
            table:
              A:
                0: [{pop: [i, j]}, {pop: [i, i]}]
            `;

          let spec = parseSpec(str);
          assert(spec.simulatable);
        });

        it('read does not distinguish', function () {
          let str = stripIndent`
            type: pda
            epsilon: e
            table:
              A:
                0:
                e:
            `;

          let spec = parseSpec(str);
          assert(!spec.simulatable);
        });

        it('read distinguishes', function () {
          let str = stripIndent`
            type: pda
            epsilon: e
            table:
              A:
                0:
                1:
            `;

          let spec = parseSpec(str);
          assert(spec.simulatable);
        });
      });
    });

    describe('TM', function() {
      describe('blank', function() {
        it('blank is undefined', function () {
          let str = stripIndent`
            type: tm
            `;

          assert.throws(() => parseSpec(str), _.conforms({
              name: _.partial(_.isEqual, 'TMSpecError'),
              reason: _.partial(_.isEqual, 'Validation Error'),
              details: _.conforms({
                info: (lst) => _.find(lst, _.conforms({
                  constraints: _.conforms({
                    isDefined: _.partial(_.isEqual, 'blank should not be null or undefined')
                  })
                }))
              })
            })
          );
        });

        it('blank is null', function () {
          let str = stripIndent`
            type: tm
            blank:
            `;

          assert.throws(() => parseSpec(str), _.conforms({
              name: _.partial(_.isEqual, 'TMSpecError'),
              reason: _.partial(_.isEqual, 'Validation Error'),
              details: _.conforms({
                info: (lst) => _.find(lst, _.conforms({
                  constraints: _.conforms({
                    isDefined: _.partial(_.isEqual, 'blank should not be null or undefined')
                  })
                }))
              })
            })
          );
        });

        it('legal', function () {
          let str = stripIndent`
            type: tm
            blank: ' '
            `;

          let spec = parseSpec(str);
          assert.strictEqual(spec.blank, ' ');
        });
      });

      describe('transition table', function() {
        it('regular', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              0: {write: '1', move: 'L', state: A}
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', write: '1', move: 'L', to: 'A' }]
            }
          });
        });

        it('null transition', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              0:
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              '0': [{ from: 'A', read: '0', write: '0', move: 'S', to: 'A' }]
            }
          });
        });

        it('state undefined', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: {write: b, move: 'L'}
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              'a': [{ from: 'A', read: 'a', write: 'b', move: 'L', to: 'A' }]
            }
          });
        });

        it('state null', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: {write: b, move: L, state:}
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              'a': [{ from: 'A', read: 'a', write: 'b', move: 'L', to: 'A' }]
            }
          });
        });

        it('non string state', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            1:
              a: {write: 'b', move: L, state: 2}
            2:
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            '1': {
              'a': [{ from: '1', read: 'a', write: 'b', move: 'L', to: '2' }]
            },
            '2': {}
          });
        });

        it('write undefined', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: {move: L, state: A}
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              'a': [{ from: 'A', read: 'a', write: 'a', move: 'L', to: 'A' }]
            }
          });
        });

        it('write null', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: {write: , move: L, state: A}
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              'a': [{ from: 'A', read: 'a', write: 'a', move: 'L', to: 'A' }]
            }
          });
        });

        it('move undefined', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: {write: , state: A}
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              'a': [{ from: 'A', read: 'a', write: 'a', move: 'S', to: 'A' }]
            }
          });
        });

        it('move null', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: {write: , move: , state: A}
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              'a': [{ from: 'A', read: 'a', write: 'a', move: 'S', to: 'A' }]
            }
          });
        });

        it('illegal move', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: {write: , move: P, state: A}
          `;

          assert.throws(() => parseSpec(str),    {
            name: 'TMSpecError',
            details: {
              problemValue: 'P'
            }
          });
        });

        it('multiple', function () {
          let str = stripIndent`
          type: tm
          blank: ' '
          table:
            A:
              a: [{write: b, move: L, state: B}, {write: c, move: R, state: C}]
            B:
            C:
          `;

          let spec = parseSpec(str);
          assert.deepStrictEqual(spec.table,    {
            A: {
              'a': [{ from: 'A', read: 'a', write: 'b', move: 'L', to: 'B' },
                    { from: 'A', read: 'a', write: 'c', move: 'R', to: 'C' }]
            },
            B: {},
            C: {}
          });
        });
      });
    });
  });
});