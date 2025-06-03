const { MongoClient, ServerApiVersion } = require('mongodb');

// Replace the placeholder with your local connection string
const uri = "mongodb://localhost:27017";

// Create a MongoClient with a ServerApi version of 1
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // Ping your deployment to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // You can now interact with your database, e.g., select a database
    const database = client.db('cruw_db'); // Replace 'cruw_db' with your desired database name
    console.log(`Connected to database: ${database.databaseName}`);

    // Further database operations (insert, find, etc.) would go here

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.error); 