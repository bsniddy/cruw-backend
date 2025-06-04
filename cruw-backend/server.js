const express = require('express');
const app = express();
const port = process.env.PORT || 3001;

// 1. Import dotenv and load environment variables
require('dotenv').config({ path: './server/config.env' }); // Adjust path if needed

// 2. Import MongoClient
const { MongoClient, ServerApiVersion } = require('mongodb');

// 3. Get the MongoDB connection URI
const uri = process.env.ATLAS_URI;

// Create a MongoClient with a ServerApi version of 1
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware to parse JSON bodies
app.use(express.json());

// Define a simple root route
app.get('/', (req, res) => {
  res.send('CRUW Backend is running!');
});

// --- API route to create a new habit ---
app.post('/api/habits', async (req, res) => {
  // Get the database connection from app.locals
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the habits collection
  const collection = db.collection('habits'); // *** Assuming your collection name is 'habits' ***

  // Get the habit data from the request body
  const newHabitData = req.body;
  
  // Basic validation (you'll want more robust validation)
  if (!newHabitData || !newHabitData.title || !newHabitData.createdBy) {
    res.status(400).json({ message: 'Missing required habit data (title, createdBy).' });
    return;
  }

  // Add server-side generated fields (like createdAt)
  const habitToInsert = {
    ...newHabitData, // Spread the original data, as 'color' is no longer expected
    createdAt: new Date(), // Set the creation date on the backend
    // MongoDB will automatically add the _id field
  };

  try {
    // Insert the new habit document into the collection
    const result = await collection.insertOne(habitToInsert);

    // Send a success response with the inserted document's ID
    res.status(201).json({ message: 'Habit created successfully!', insertedId: result.insertedId, insertedHabit: habitToInsert });
  } catch (error) {
    console.error('Error creating habit:', error);
    res.status(500).json({ message: 'Failed to create habit.', error: error.message });
  }
});
// --- End of API route ---

// --- API route to create a new user ---
app.post('/api/users', async (req, res) => {
  // Get the database connection from app.locals
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the users collection
  const collection = db.collection('users'); // Corrected collection name

  // Get the user data from the request body
  const newUserData = req.body;
  
  // Basic validation
  if (!newUserData || !newUserData.username || !newUserData.email || !newUserData.password) {
    res.status(400).json({ message: 'Missing required user data (username, email, password).' });
    return;
  }

  try {
    // --- Password Hashing ---
    // Generate a salt
    const saltRounds = 10; // Standard value
    const salt = await bcrypt.genSalt(saltRounds);
    
    // Hash the password with the salt
    const hashedPassword = await bcrypt.hash(newUserData.password, salt);
    // --- End Password Hashing ---

    // Prepare user document for insertion
    const userToInsert = {
      username: newUserData.username,
      email: newUserData.email,
      password: hashedPassword, // Store the hashed password
      createdAt: new Date(),
      // Include other user fields as needed
    };

    // Insert the new user document into the collection
    const result = await collection.insertOne(userToInsert);

    // Send a success response (Exclude the password hash from the response)
    res.status(201).json({ message: 'User created successfully!', insertedId: result.insertedId, username: userToInsert.username, email: userToInsert.email });

  } catch (error) {
    console.error('Error creating user:', error);

    // Check for duplicate key error (e.g., duplicate username or email if you have unique indexes)
    if (error.code === 11000) {
      res.status(409).json({ message: 'User with that email or username already exists.' });
    } else {
      res.status(500).json({ message: 'Failed to create user.', error: error.message });
    }
  }
});
// --- End of API route ---

// --- Async function to connect to DB and start server ---
async function startServer() {
  try {
    // Connect the client to the server
    await client.connect();

    // Ping to confirm connection (optional but good for verification)
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB successfully connected!");

    // Get a reference to your database
    const database = client.db('cruw_db'); // Replace 'cruw_db' with your desired database name

    // Make the database object accessible to your route handlers
    app.locals.db = database;
    console.log(`Connected to database: ${database.databaseName}`);


    // --- Start the Express server ONLY after the DB connection is successful ---
    app.listen(port, () => {
      console.log(`CRUW Backend listening at http://localhost:${port}`);
    });

  } catch (err) {
    console.error("Failed to connect to MongoDB or start server:", err);
    // Exit the process if the database connection fails
    process.exit(1);
  }
}

// --- Call the async function to start the process ---
startServer();


// You'll add your API routes for users, groups, habits, etc., here later
// These routes will need access to the 'database' object via req.app.locals.db

// Handle server shutdown gracefully (optional but good practice)
process.on('SIGINT', async () => {
  console.log('Server is shutting down...');
  if (client) {
     await client.close();
     console.log('MongoDB connection closed.');
  }
  process.exit(0);
}); 