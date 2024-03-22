function throwErr() {
  throw new Error('This type of pagination not supported on this dialect')
}

const PaginationNotSupported = (superclass) => class extends superclass {
  // eslint-disable-next-line class-methods-use-this
  handlePaginationAtRoot() { throwErr() }

  // eslint-disable-next-line class-methods-use-this
  handleJoinedOneToManyPaginated() { throwErr() }

  // eslint-disable-next-line class-methods-use-this
  handleBatchedOneToManyPaginated() { throwErr() }

  // eslint-disable-next-line class-methods-use-this
  handleJoinedManyToManyPaginated() { throwErr() }

  // eslint-disable-next-line class-methods-use-this
  handleBatchedManyToManyPaginated() { throwErr() }
}

module.exports = {
  PaginationNotSupported
}