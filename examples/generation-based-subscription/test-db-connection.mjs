import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'

loadEnv({ path: '.env.local' })

async function testConnection() {
	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
	})

	let client
	try {
		client = await pool.connect()
		console.log('Testing database connection...')
		console.log(
			'Connection string:',
			process.env.DATABASE_URL?.replace(/:[^:]*@/, ':****@')
		)

		const result = await client.query('SELECT NOW()')
		console.log('✅ Connection successful!')
		console.log('Current time from database:', result.rows[0].now)
	} catch (error) {
		console.error('❌ Connection failed:')
		console.error(error.message)
		console.error('\nPossible issues:')
		console.error('1. Check if the password is correct')
		console.error('2. Verify the database URL format')
		console.error('3. Ensure the database allows connections from your IP')
	} finally {
		if (client) {
			client.release()
		}
		await pool.end()
	}
}

testConnection()


