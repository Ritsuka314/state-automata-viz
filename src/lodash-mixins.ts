import * as _ from 'lodash';

interface LoDashMixins extends _.LoDashStatic {
  equalsTo<T> (x: T): boolean;
  contains<T> (lst: T[], item: T): boolean;
}

let equalsTo = x => _.partial(_.isEqual, x);

_.mixin({
  equalsTo: equalsTo,
  contains: (lst, item) => _.find(lst, equalsTo(item)),
});

export default <LoDashMixins>_;