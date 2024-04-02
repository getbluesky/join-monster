import { filter } from 'lodash'
import {
  interpretForKeysetPaging,
  interpretForOffsetPaging,
  keysetPagingSelect,
  offsetPagingSelect,
  orderingsToString
} from '../shared'
import { PaginationNotSupported } from './mixins/pagination-not-supported'
import { UnlimitedLimitIsMaxint } from './mixins/unlimitedLimit-is-maxint'

class Dialect extends UnlimitedLimitIsMaxint(PaginationNotSupported(function () { })) {
  // eslint-disable-next-line class-methods-use-this
  get name() { return 'mariadb' }

  joinUnions(unions, as) {
    return `FROM (
  ${unions.join('\nUNION\n')}
  ) AS ${this.quote(as)}`
  }

  paginatedSelect(
    table,
    as,
    whereConditions,
    order,
    limit,
    offset,
    opts = {}
  ) {
    const { extraJoin, withTotal } = opts
    as = this.quote(as)
    return `\
    (SELECT ${as}.*${withTotal ? ', count(*) OVER () AS `$total`' : ''}
    FROM ${table} ${as}
    ${extraJoin
        ? `LEFT JOIN ${extraJoin.name} ${this.quote(extraJoin.as)}
      ON ${extraJoin.condition}`
        : ''
      }
    WHERE ${whereConditions}
    ORDER BY ${orderingsToString(order.columns, this.quote, order.table)}
    LIMIT ${limit}${offset ? ' OFFSET ' + offset : ''})`
  }

  // eslint-disable-next-line class-methods-use-this
  quote(str) {
    return `\`${str}\``
  }

  compositeKey(parent, keys) {
    keys = keys.map(key => `${this.quote(parent)}.${this.quote(key)}`)
    return `CONCAT(${keys.join(', ')})`
  }

  async handlePaginationAtRoot(parent, node, context, tables) {
    const pagingWhereConditions = []
    if (node.sortKey) {
      const {
        limit,
        order,
        whereCondition: whereAddendum
      } = interpretForKeysetPaging(node, this)
      pagingWhereConditions.push(whereAddendum)
      if (node.where) {
        pagingWhereConditions.push(
          await node.where(`${this.quote(node.as)}`, node.args || {}, context, node)
        )
      }
      tables.push(
        keysetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          node.as,
          { q: this.quote }
        )
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      if (node.where) {
        pagingWhereConditions.push(
          await node.where(`${this.quote(node.as)}`, node.args || {}, context, node)
        )
      }
      tables.push(
        offsetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          offset,
          node.as,
          { q: this.quote }
        )
      )
    }
  }

  async handleBatchedOneToManyPaginated(
    parent,
    node,
    context,
    tables,
    batchScope
  ) {
    const pagingWhereConditions = []
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`${this.quote(node.as)}`, node.args || {}, context, node)
      )
    }
    if (node.sortKey) {
      const {
        limit,
        order,
        whereCondition: whereAddendum
      } = interpretForKeysetPaging(node, this)
      pagingWhereConditions.push(whereAddendum)
      const unions = batchScope.map(val => {
        let whereConditions = [
          ...pagingWhereConditions,
          `${this.quote(node.as)}.${this.quote(node.sqlBatch.thisKey.name)} = ${val}`
        ]
        whereConditions = filter(whereConditions).join(' AND ') || '1'
        return this.paginatedSelect(
          node.name,
          node.as,
          whereConditions,
          order,
          limit,
          null
        )
      })
      tables.push(this.joinUnions(unions, node.as))
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      const unions = batchScope.map(val => {
        let whereConditions = [
          ...pagingWhereConditions,
          `${this.quote(node.as)}.${this.quote(node.sqlBatch.thisKey.name)} = ${val}`
        ]
        whereConditions = filter(whereConditions).join(' AND ') || '1'
        return this.paginatedSelect(
          node.name,
          node.as,
          whereConditions,
          order,
          limit,
          offset,
          { withTotal: true }
        )
      })
      tables.push(this.joinUnions(unions, node.as))
    }
  }

  async handleBatchedManyToManyPaginated(
    parent,
    node,
    context,
    tables,
    batchScope,
    joinCondition
  ) {
    const pagingWhereConditions = []
    if (node.junction.where) {
      pagingWhereConditions.push(
        await node.junction.where(
          `${this.quote(node.junction.as)}`,
          node.args || {},
          context,
          node
        )
      )
    }
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`${this.quote(node.as)}`, node.args || {}, context, node)
      )
    }

    if (node.where || node.orderBy) {
      var extraJoin = {
        name: node.name,
        as: node.as,
        condition: joinCondition
      }
    }
    if (node.sortKey || node.junction.sortKey) {
      const {
        limit,
        order,
        whereCondition: whereAddendum
      } = interpretForKeysetPaging(node, this)
      pagingWhereConditions.push(whereAddendum)
      const unions = batchScope.map(val => {
        let whereConditions = [
          ...pagingWhereConditions,
          `${this.quote(node.junction.as)}.${this.quote(
            node.junction.sqlBatch.thisKey.name
          )} = ${val}`
        ]
        whereConditions = filter(whereConditions).join(' AND ') || '1'
        return this.paginatedSelect(
          node.junction.sqlTable,
          node.junction.as,
          whereConditions,
          order,
          limit,
          null,
          { extraJoin }
        )
      })
      tables.push(this.joinUnions(unions, node.junction.as))
    } else if (node.orderBy || node.junction.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      const unions = batchScope.map(val => {
        let whereConditions = [
          ...pagingWhereConditions,
          `${this.quote(node.junction.as)}.${this.quote(
            node.junction.sqlBatch.thisKey.name
          )} = ${val}`
        ]
        whereConditions = filter(whereConditions).join(' AND ') || '1'
        return this.paginatedSelect(
          node.junction.sqlTable,
          node.junction.as,
          whereConditions,
          order,
          limit,
          offset,
          {
            withTotal: true,
            extraJoin
          }
        )
      })
      tables.push(this.joinUnions(unions, node.junction.as))
    }
    tables.push(
      `LEFT JOIN ${node.name} AS ${this.quote(node.as)} ON ${joinCondition}`
    )
  }
}

module.exports = {
  dialect: new Dialect(),
  Dialect,
}