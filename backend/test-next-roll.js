require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ DB Connected');

  const app = express();
  app.use(express.json());
  const uccRoutes = require('./routes/ucc');
  app.use('/api/ucc', uccRoutes);

  const server = app.listen(0, async () => {
    const port = server.address().port;
    console.log('Test server on port:', port);

    try {
      const batches = ['Science%20BN%201', 'Humnities%20BN%201', 'Exam%20BATCH%20B%20unit', 'Business%20Studies%20BN%201'];
      for (const b of batches) {
        const res = await fetch('http://localhost:' + port + '/api/ucc/admission/next-roll/' + b);
        const data = await res.json();
        console.log('\nBatch:', decodeURIComponent(b));
        console.log('Response:', JSON.stringify(data));
      }
    } catch(e) {
      console.error('Fetch error:', e.message);
    }
    server.close();
    await mongoose.connection.close();
    process.exit(0);
  });
}

test().catch(e => { console.error(e); process.exit(1); });
