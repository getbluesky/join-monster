import faker from 'faker'


function* count(limit) {
  for (let i = 0; i < limit; i++) {
    yield i
  }
}

const numUsers = 5
const numPosts = 50
const numComments = 300
const numRelationships = 15

module.exports = async () => {
  const knex = require('../schema/setup')('demo')

  console.log('creating accounts...')
  const accounts = new Array(numUsers)
  for (let i of count(numUsers)) {
    accounts[i] = {
      first_name: faker.name.firstName(),
      last_name: faker.name.lastName(),
      email_address: faker.internet.email(),
      created_at: faker.date.past()
    }
  }
  await knex.batchInsert('accounts', accounts, 50)

  console.log('creating posts...')
  const posts = new Array(numPosts)
  for (let i of count(numPosts)) {
    posts[i] = {
      body: faker.lorem.sentences(faker.random.number({ min: 2, max: 4 })),
      author_id: faker.random.number({ min: 1, max: numUsers }),
      created_at: faker.date.past()
    }
  }
  await knex.batchInsert('posts', posts, 50)

  console.log('creating comments...')
  const comments = new Array(numComments)
  for (let i of count(numComments)) {
    comments[i] = {
      body: faker.hacker.phrase(),
      post_id: faker.random.number({ min: 1, max: numPosts }),
      author_id: faker.random.number({ min: 1, max: numUsers }),
      created_at: faker.date.past()
    }
  }
  await knex.batchInsert('comments', comments, 50)

  console.log('creating relationships...')
  const relationships = []
  const used = new Set
  for (let i of count(numRelationships)) {
    const follower_id = faker.random.number({ min: 1, max: numUsers })
    const followee_id = faker.random.number({ min: 1, max: numUsers })
    const key = `${follower_id}-${followee_id}`
    if (!used.has(key)) {
      relationships.push({
        follower_id,
        followee_id,
        created_at: faker.date.past()
      })
    }
    used.add(key)
  }
  await knex.batchInsert('relationships', relationships, 50)


  await knex.batchInsert('sponsors', [
    {
      generation: 1,
      first_name: 'erlich',
      last_name: 'bachman'
    },
    {
      generation: 1,
      first_name: 'andrew',
      last_name: 'bachman'
    },
    {
      generation: 2,
      first_name: 'erlich',
      last_name: 'bachman'
    },
    {
      generation: 2,
      first_name: 'matt',
      last_name: 'bachman'
    },
    {
      generation: 1,
      first_name: 'matt',
      last_name: 'daemon'
    }
  ])

  await knex.destroy()
}