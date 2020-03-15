'use strict';

let assert = require('assert');
import * as Yup from 'yup'
import * as _ from 'lodash';
import {string, object, array, mixed} from 'yup';

declare interface LoginFormValues {}

describe('test', function() {
  it('legal', function () {

    const values = [
      { key: 'a', value: 'b'},
      { key: 'c', value: 'd'},
    ]

    const validated = array().of(object({
      key: string(),
      value: mixed(),
    })).transform((val) => _.chain(val)
      .map((item) => ({[item.key]: item.value}))
      .thru(_.spread(_.merge))
      .value())
      .validateSync(values);

    const transformed = _.chain(validated)
      .map((item) => ({[item.key]: item.value}))
      .thru(_.spread(_.merge))
      .value();

    console.log(transformed);
// >> { a: 'b', c: 'd' }

  });
});