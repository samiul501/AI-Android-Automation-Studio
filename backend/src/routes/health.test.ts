import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { healthRouter } from './health.js'

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const app = express()
    app.use('/api', healthRouter)

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })
})
