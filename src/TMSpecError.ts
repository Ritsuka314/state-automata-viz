'use strict';

import * as _ from 'lodash';
import * as util from "util";

class TMSpecError extends Error {
  public reason;
  public details;

  constructor (reason, details) {
    super();

    this.name = 'TMSpecError';

    this.reason = reason;
    this.details = details || {};

    // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TMSpecError.prototype);
  }

  // generate a formatted description in HTML
  get message() {
    let header = this.reason;
    let details = this.details;

    function code(str) { return '<code>' + str + '</code>'; }
    function showLoc(state, symbol, synonym) {
      if (state != null) {
        if (symbol != null) {
          return ' in the transition from state ' + code(state) + ' and symbol ' + code(symbol);
        } else {
          return ' for state ' + code(state);
        }
      } else if (synonym != null) {
        return ' in the definition of synonym ' + code(synonym);
      }
      return '';
    }

    let problemValue = details.problemValue ? ' ' + code(details.problemValue) : '';
    let location = showLoc(details.state, details.symbol, details.synonym);
    let sentences = ['<strong>' + header + problemValue + '</strong>' + location
      , details.info, details.suggestion]
    .filter(_.identity)
    .map((s) => s + '.');
    if (location) { sentences.splice(1, 0, '<br>'); }
    return sentences.join(' ');
  }
}

export default TMSpecError;