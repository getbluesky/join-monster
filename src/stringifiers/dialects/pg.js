import {
  keysetPagingSelect,
  offsetPagingSelect,
  interpretForOffsetPaging,
  interpretForKeysetPaging,
  generateCastExpressionFromValueType
} from '../shared'

class Dialect {
  // eslint-disable-next-line class-methods-use-this
  get name() {
    return 'pg'
  }

  // eslint-disable-next-line class-methods-use-this
  quote(str) {
    return `"${str}"`
  }

  compositeKey(parent, keys) {
    keys = keys.map(key => `${this.quote(parent)}.${this.quote(key)}`)
    return `NULLIF(CONCAT(${keys.join(', ')}), '')`
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
        this.quote(parent.as),
        this.quote(node.as),
        node.args || {},
        context,
        node
      )
    ]
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(this.quote(node.as), node.args || {}, context, node)
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
        keysetPagingSelect(
          node.name,
          pagingWhereConditions,
          order,
          limit,
          node.as,
          { joinCondition, joinType: 'LEFT' }
        )
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, this)
      tables.push(
        offsetPagingSelect(
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

  async handleBatchedManyToManyPaginated(
    parent,
    node,
    context,
    tables,
    batchScope,
    joinCondition
  ) {
    const thisKeyOperand = generateCastExpressionFromValueType(
      `${this.quote(node.junction.as)}.${this.quote(node.junction.sqlBatch.thisKey.name)}`,
      batchScope[0]
    )
    const pagingWhereConditions = [
      `${thisKeyOperand} = temp.${this.quote(node.junction.sqlBatch.parentKey.name)}`
    ]
    if (node.junction.where) {
      pagingWhereConditions.push(
        await node.junction.where(
          this.quote(node.junction.as),
          node.args || {},
          context,
          node
        )
      )
    }
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(this.quote(node.as), node.args || {}, context, node)
      )
    }

    const tempTable = `FROM (VALUES ${batchScope.map(
      val => `(${val})`
    )}) temp(${this.quote(node.junction.sqlBatch.parentKey.name)})`
    tables.push(tempTable)
    const lateralJoinCondition = `${thisKeyOperand} = temp.${this.quote(node.junction.sqlBatch.parentKey.name)}`

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
        keysetPagingSelect(
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
        offsetPagingSelect(
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
    tables.push(`LEFT JOIN ${node.name} AS ${this.quote(node.as)} ON ${joinCondition}`)
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
        this.quote(parent.as),
        this.quote(node.junction.as),
        node.args || {},
        context,
        node
      )
    ]
    if (node.junction.where) {
      pagingWhereConditions.push(
        await node.junction.where(
          this.quote(node.junction.as),
          node.args || {},
          context,
          node
        )
      )
    }
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(this.quote(node.as), node.args || {}, context, node)
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
        keysetPagingSelect(
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
        offsetPagingSelect(
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
          await node.where(this.quote(node.as), node.args || {}, context, node)
        )
      }
      tables.push(
        keysetPagingSelect(
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
          await node.where(this.quote(node.as), node.args || {}, context, node)
        )
      }
      tables.push(
        offsetPagingSelect(
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

  async handleBatchedOneToManyPaginated(
    parent,
    node,
    context,
    tables,
    batchScope
  ) {
    const thisKeyOperand = generateCastExpressionFromValueType(
      `${this.quote(node.as)}.${this.quote(node.sqlBatch.thisKey.name)}`,
      batchScope[0]
    )
    const pagingWhereConditions = [
      `${thisKeyOperand} = temp.${this.quote(node.sqlBatch.parentKey.name)}`
    ]
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(this.quote(node.as), node.args || {}, context, node)
      )
    }
    const tempTable = `FROM (VALUES ${batchScope.map(
      val => `(${val})`
    )}) temp(${this.quote(node.sqlBatch.parentKey.name)})`
    tables.push(tempTable)
    const lateralJoinCondition = `${thisKeyOperand} = temp.${this.quote(node.sqlBatch.parentKey.name)}`
    if (node.sortKey) {
      const {
        limit,
        order,
        whereCondition: whereAddendum
      } = interpretForKeysetPaging(node, this)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        keysetPagingSelect(
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
        offsetPagingSelect(
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
}
module.exports = {
  dialect: new Dialect(),
  Dialect,
}
