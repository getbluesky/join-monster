import { filter } from 'lodash'
import {
  interpretForKeysetPaging,
  interpretForOffsetPaging,
  orderingsToString
} from '../shared'
import { UnlimitedLimitIsMaxint } from './mixins/unlimitedLimit-is-maxint'
import { Dialect as PostgresDialect } from './pg'

class Dialect extends UnlimitedLimitIsMaxint(PostgresDialect) {
  // eslint-disable-next-line class-methods-use-this
  get name() { return 'oracle' }

  keysetPagingSelect(
    table,
    whereCondition,
    order,
    limit,
    as,
    options = {}
  ) {
    let { joinCondition, joinType, extraJoin } = options
    whereCondition = filter(whereCondition).join(' AND ') || '1 = 1'
    if (joinCondition) {
      return `\
${joinType === 'LEFT' ? 'OUTER' : 'CROSS'} APPLY (
  SELECT "${as}".*
  FROM ${table} "${as}"
  ${extraJoin
          ? `LEFT JOIN ${extraJoin.name} ${this.quote(extraJoin.as)}
    ON ${extraJoin.condition}`
        : ''
        }
  WHERE ${whereCondition}
  ORDER BY ${orderingsToString(order.columns, this.quote, order.table)}
  FETCH FIRST ${limit} ROWS ONLY
) ${this.quote(as)}`
    }
    return `\
FROM (
  SELECT "${as}".*
  FROM ${table} "${as}"
  WHERE ${whereCondition}
  ORDER BY ${orderingsToString(order.columns, this.quote, order.table)}
  FETCH FIRST ${limit} ROWS ONLY
) ${this.quote(as)}`
  }

  offsetPagingSelect(
    table,
    pagingWhereConditions,
    order,
    limit,
    offset,
    as,
    options = {}
  ) {
    let { joinCondition, joinType, extraJoin } = options
    const whereCondition = filter(pagingWhereConditions).join(' AND ') || '1 = 1'
    if (joinCondition) {
      return `\
${joinType === 'LEFT' ? 'OUTER' : 'CROSS'} APPLY (
  SELECT "${as}".*, count(*) OVER () AS ${this.quote('$total')}
  FROM ${table} "${as}"
  ${extraJoin
          ? `LEFT JOIN ${extraJoin.name} ${this.quote(extraJoin.as)}
    ON ${extraJoin.condition}`
        : ''
        }
  WHERE ${whereCondition}
  ORDER BY ${orderingsToString(order.columns, this.quote, order.table)}
  OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
) ${this.quote(as)}`
    }
    return `\
FROM (
  SELECT "${as}".*, count(*) OVER () AS ${this.quote('$total')}
  FROM ${table} "${as}"
  WHERE ${whereCondition}
  ORDER BY ${orderingsToString(order.columns, this.quote, order.table)}
  OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
) ${this.quote(as)}`
  }

  recursiveConcat(keys) {
    if (keys.length <= 1) {
      return keys[0]
    }
    return this.recursiveConcat([`CONCAT(${keys[0]}, ${keys[1]})`, ...keys.slice(2)])
  }

  compositeKey(parent, keys) {
    keys = keys.map(key => `${this.quote(parent)}.${this.quote(key)}`)
    return `NULLIF(${this.recursiveConcat(keys)}, '')`
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
          await node.where(`"${node.as}"`, node.args || {}, context, node)
        )
      }
      tables.push(
        this.keysetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          node.as
        )
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      if (node.where) {
        pagingWhereConditions.push(
          await node.where(`"${node.as}"`, node.args || {}, context, node)
        )
      }
      tables.push(
        this.offsetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          offset,
          node.as
        )
      )
    }
  }

  async handleJoinedOneToManyPaginated(
    parent,
    node,
    context,
    tables,
    joinCondition
  ) {
    const pagingWhereConditions = [
      await node.sqlJoin(
        `"${parent.as}"`,
        this.quote(node.as),
        node.args || {},
        context,
        node
      )
    ]
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`"${node.as}"`, node.args || {}, context, node)
      )
    }

    // which type of pagination are they using?
    if (node.sortKey) {
      const {
        limit,
        order,
        whereCondition: whereAddendum
      } = interpretForKeysetPaging(node, this)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        this.keysetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          node.as,
          {
            joinCondition,
            joinType: 'LEFT'
          }
        )
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      tables.push(
        this.offsetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          offset,
          node.as,
          {
            joinCondition,
            joinType: 'LEFT'
          }
        )
      )
    }
  }

  async handleJoinedManyToManyPaginated(
    parent,
    node,
    context,
    tables,
    joinCondition1,
    joinCondition2
  ) {
    const pagingWhereConditions = [
      await node.junction.sqlJoins[0](
        `"${parent.as}"`,
        `"${node.junction.as}"`,
        node.args || {},
        context,
        node
      )
    ]
    if (node.junction.where) {
      pagingWhereConditions.push(
        await node.junction.where(
          `"${node.junction.as}"`,
          node.args || {},
          context,
          node
        )
      )
    }
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`"${node.as}"`, node.args || {}, context, node)
      )
    }

    const lateralJoinOptions = {
      joinCondition: joinCondition1,
      joinType: 'LEFT'
    }
    if (node.where || node.orderBy) {
      lateralJoinOptions.extraJoin = {
        name: node.name,
        as: node.as,
        condition: joinCondition2
      }
    }
    if (node.sortKey || node.junction.sortKey) {
      const {
        limit,
        order,
        whereCondition: whereAddendum
      } = interpretForKeysetPaging(node, this)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        this.keysetPagingSelect(
          node.junction.sqlTable,
          pagingWhereConditions,
          order,
          limit,
          node.junction.as,
          lateralJoinOptions
        )
      )
    } else if (node.orderBy || node.junction.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      tables.push(
        this.offsetPagingSelect(
          node.junction.sqlTable,
          pagingWhereConditions,
          order,
          limit,
          offset,
          node.junction.as,
          lateralJoinOptions
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
    const pagingWhereConditions = [
      `"${node.as}"."${node.sqlBatch.thisKey.name}" = "temp"."value"`
    ]
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`"${node.as}"`, node.args || {}, context, node)
      )
    }
    tables.push(`FROM (${this.arrToTableUnion(batchScope)}) "temp"`)
    const lateralJoinCondition = `"${node.as}"."${node.sqlBatch.thisKey.name}" = "temp"."value"`
    if (node.sortKey) {
      const {
        limit,
        order,
        whereCondition: whereAddendum
      } = interpretForKeysetPaging(node, this)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        this.keysetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          node.as,
          { joinCondition: lateralJoinCondition }
        )
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      tables.push(
        this.offsetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          offset,
          node.as,
          {
            joinCondition: lateralJoinCondition
          }
        )
      )
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
    const pagingWhereConditions = [
      `"${node.junction.as}"."${node.junction.sqlBatch.thisKey.name}" = "temp"."value"`
    ]
    if (node.junction.where) {
      pagingWhereConditions.push(
        await node.junction.where(
          `"${node.junction.as}"`,
          node.args || {},
          context,
          node
        )
      )
    }
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`"${node.as}"`, node.args || {}, context, node)
      )
    }

    tables.push(`FROM (${this.arrToTableUnion(batchScope)}) "temp"`)
    const lateralJoinCondition = `"${node.junction.as}"."${node.junction.sqlBatch.thisKey.name}" = "temp"."value"`

    const lateralJoinOptions = {
      joinCondition: lateralJoinCondition,
      joinType: 'LEFT'
    }
    if (node.where || node.orderBy) {
      lateralJoinOptions.extraJoin = {
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
      tables.push(
        this.keysetPagingSelect(
          node.junction.sqlTable,
          pagingWhereConditions,
          order,
          limit,
          node.junction.as,
          lateralJoinOptions
        )
      )
    } else if (node.orderBy || node.junction.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      tables.push(
        this.offsetPagingSelect(
          node.junction.sqlTable,
          pagingWhereConditions,
          order,
          limit,
          offset,
          node.junction.as,
          lateralJoinOptions
        )
      )
    }
    tables.push(`LEFT JOIN ${node.name} "${node.as}" ON ${joinCondition}`)
  }

  // eslint-disable-next-line class-methods-use-this
  arrToTableUnion(arr) {
    return arr
      .map(
        val => `
    SELECT ${val} AS "value" FROM DUAL
  `
      )
      .join(' UNION ')
  }
}

module.exports = {
  dialect: new Dialect(),
  Dialect,
}
