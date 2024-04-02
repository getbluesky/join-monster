import { Dialect as MariaDB } from './mariadb'

class Dialect extends MariaDB {
  // eslint-disable-next-line class-methods-use-this
  get name() {
    return 'mysql8'
  }
}

module.exports = {
  dialect: new Dialect(),
  Dialect,
}