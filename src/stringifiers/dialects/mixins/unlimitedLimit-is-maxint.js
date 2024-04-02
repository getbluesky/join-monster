const UnlimitedLimitIsMaxint = (superclass) => class extends superclass {
  // eslint-disable-next-line class-methods-use-this
  unlimitedLimit() {
    return '18446744073709551615'
  }
}

module.exports = {
  UnlimitedLimitIsMaxint
}

