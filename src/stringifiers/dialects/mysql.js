import { PaginationNotSupported } from './mixins/pagination-not-supported'

class Dialect extends PaginationNotSupported(function () { }) {
  // eslint-disable-next-line class-methods-use-this
  get name() {
    return 'mysql'
  }

  // eslint-disable-next-line class-methods-use-this
  quote(str) {
    return `\`${str}\``
  }

  compositeKey(parent, keys) {
    keys = keys.map(key => `${this.quote(parent)}.${this.quote(key)}`)
    return `CONCAT(${keys.join(', ')})`
  }
}

module.exports = {
  dialect: new Dialect(),
  Dialect,
}
