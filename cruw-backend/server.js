const express = require('express');
const app = express();
const port = process.env.PORT || 3001;

// 1. Import dotenv and load environment variables
require('dotenv').config({ path: './server/config.env' }); // Adjust path if needed

// 2. Import MongoClient and ObjectId
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Import bcryptjs for password hashing
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken

// 3. Get the MongoDB connection URI
const uri = process.env.ATLAS_URI;
// Get JWT Secret
const jwtSecret = process.env.JWT_SECRET; // Get JWT secret from environment variables

// Ensure JWT Secret is loaded
if (!jwtSecret) {
    console.error("FATAL ERROR: JWT_SECRET is not defined.");
    process.exit(1);
}

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
  
  // Basic validation (requires title, createdBy, assignedTo, schedule)
  if (!newHabitData || !newHabitData.title || !newHabitData.createdBy || !newHabitData.assignedTo || !newHabitData.schedule) {
    res.status(400).json({ message: 'Missing required habit data (title, createdBy, assignedTo, or schedule).' });
    return;
  }

  // Ensure assignedTo has type and id
  if (!newHabitData.assignedTo.type || !newHabitData.assignedTo.id) {
      res.status(400).json({ message: 'Invalid assignedTo format.' });
      return;
  }

  // Add server-side generated fields (like createdAt) and convert ObjectIds
  try {
      // Optional: Check if IDs are valid ObjectId strings before conversion
      if (!ObjectId.isValid(newHabitData.createdBy) || !ObjectId.isValid(newHabitData.assignedTo.id)) {
          res.status(400).json({ message: 'Invalid ID format for createdBy or assignedTo.id.' });
          return;
      }

      const habitToInsert = {
          ...newHabitData,
          createdBy: new ObjectId(newHabitData.createdBy), // Convert string to ObjectId
          assignedTo: { // Convert assignedTo.id to ObjectId
              type: newHabitData.assignedTo.type,
              id: new ObjectId(newHabitData.assignedTo.id),
          },
          createdAt: new Date(), // Set the creation date on the backend
          // MongoDB will automatically add the _id field
      };

      const result = await collection.insertOne(habitToInsert);

      // Send a success response with the inserted document's ID
      res.status(201).json({ message: 'Habit created successfully!', insertedId: result.insertedId, insertedHabit: habitToInsert });
  } catch (error) {
      console.error('Error creating habit:', error);
      // Handle errors including potential invalid ObjectId format
      res.status(500).json({ message: 'Failed to create habit.', error: error.message });
  }
});
// --- End of API route ---

// --- API route to create a new user (Sign Up) ---
// NOTE: The provided sample for CRUW.users looks like a group document. This route assumes a standard user schema with username, email, hashed password.
// If your actual user schema is different, this route will need significant adjustment.
app.post('/api/users', async (req, res) => {
  // Get the database connection from app.locals
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the users collection
  const collection = db.collection('users'); // Assuming collection name is 'users'

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

    // Prepare user document for insertion based on assumed schema
    const userToInsert = {
      username: newUserData.username,
      email: newUserData.email,
      password: hashedPassword, // Store the hashed password
      createdAt: new Date(),
      // Include other user fields as needed based on YOUR actual user schema
      // e.g., if you have 'name', 'bio', etc., add them here explicitly
      // Do NOT just spread newUserData if it might contain unintended fields.
    };

    // Insert the new user document into the collection
    const result = await collection.insertOne(userToInsert);

    // Send a success response (Exclude the password hash from the response)
    // Return minimal user info or a token
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

// --- API route for User Login ---
// This route works based on the assumption of a standard user schema (email/username and hashed password).
app.post('/api/auth/login', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the users collection
  const collection = db.collection('users'); // Assuming collection name is 'users'

  // Get credentials from request body (using email for lookup)
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    res.status(400).json({ message: 'Missing email or password.' });
    return;
  }

  try {
    // Find the user by email (or username if you prefer)
    const user = await collection.findOne({ email: email });

    // Check if user exists
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    // Check if passwords match
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    // --- User is authenticated! ---
    // Generate a JWT (JSON Web Token) here and send it back
    const token = jwt.sign(
      { id: user._id, username: user.username }, // Payload: information to encode in the token (use non-sensitive data)
      jwtSecret, // Your secret key
      { expiresIn: '1h' } // Token expiration time (e.g., 1 hour)
    );

    // Send a success response with the token
    res.status(200).json({ message: 'Login successful!', token });

  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'An error occurred during login.', error: error.message });
  }
});
// --- End of API route for User Login ---

// --- API route to create a new group ---
app.post('/api/groups', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the groups collection
  const collection = db.collection('groups'); // *** Assuming your collection name is 'groups' ***

  // Get the group data from the request body
  const newGroupData = req.body;

  // Basic validation (requires at least a name and ownerId based on your schema)
  if (!newGroupData || !newGroupData.name || !newGroupData.ownerId) {
    res.status(400).json({ message: 'Missing required group data (name, ownerId).' });
    return;
  }

  // Prepare group document for insertion
  try {
      // Optional: Check if ownerId is a valid ObjectId string before conversion
      if (!ObjectId.isValid(newGroupData.ownerId)) {
           res.status(400).json({ message: `Invalid ownerId format: ${newGroupData.ownerId}` });
           return;
      }

      const groupToInsert = {
          name: newGroupData.name,
          description: newGroupData.description, // Include description if provided
          ownerId: new ObjectId(newGroupData.ownerId), // Convert ownerId string to ObjectId
          // Initialize memberIds: If provided, map and convert to ObjectIds. Otherwise, start with just the ownerId.
          memberIds: newGroupData.memberIds ? newGroupData.memberIds.map(id => new ObjectId(id)) : [new ObjectId(newGroupData.ownerId)],
          createdAt: new Date(), // Set the creation date on the backend
          // MongoDB will automatically add the _id field
      };

       // Optional: Validate provided memberIds if the array exists
       if (newGroupData.memberIds) {
           for (const id of newGroupData.memberIds) {
               if (!ObjectId.isValid(id)) {
                   res.status(400).json({ message: `Invalid memberId format: ${id}` });
                   return;
               }
           }
       }


      // Insert the new group document into the collection
      const result = await collection.insertOne(groupToInsert);

      // Send a success response with the inserted document's ID and details
      // Exclude sensitive data if any, though for a group there might not be much
      res.status(201).json({ message: 'Group created successfully!', insertedId: result.insertedId, insertedGroup: groupToInsert });

  } catch (error) {
    console.error('Error creating group:', error);
    // Check for duplicate name error if you have a unique index on group name
    if (error.code === 11000) {
        res.status(409).json({ message: 'Group name already exists.' });
    } else {
        res.status(500).json({ message: 'Failed to create group.', error: error.message });
    }
  }
});
// --- End of API route to create a new group ---

// --- API route to create a new userHabitEntry (Log Completion) ---
app.post('/api/userHabitEntries', async (req, res) => {
    // Get the database connection
    const db = req.app.locals.db;

    // Check if the database connection is available
    if (!db) {
      res.status(500).json({ message: 'Database not connected.' });
      return;
    }

    // Get the userHabitEntries collection
    const collection = db.collection('userHabitEntries'); // *** Assuming collection name ***

    // Get the entry data from the request body
    const newEntryData = req.body;

    // Basic validation (requires habitId, userId, date, status)
    if (!newEntryData || !newEntryData.habitId || !newEntryData.userId || !newEntryData.date || !newEntryData.status) {
      res.status(400).json({ message: 'Missing required entry data (habitId, userId, date, or status).' });
      return;
    }

    // Prepare entry document for insertion
    try {
        // Optional: Check if IDs are valid ObjectId strings before conversion
        if (!ObjectId.isValid(newEntryData.habitId) || !ObjectId.isValid(newEntryData.userId)) {
            res.status(400).json({ message: 'Invalid ID format for habitId or userId.' });
            return;
        }

        const entryToInsert = {
            habitId: new ObjectId(newEntryData.habitId), // Convert habitId string to ObjectId
            userId: new ObjectId(newEntryData.userId),   // Convert userId string to ObjectId
            date: new Date(newEntryData.date), // Convert date string/timestamp to Date object
            status: newEntryData.status,
            notes: newEntryData.notes, // Include notes if provided
            // MongoDB will automatically add the _id field
        };

        const result = await collection.insertOne(entryToInsert);

        res.status(201).json({ message: 'User habit entry created successfully!', insertedId: result.insertedId, insertedEntry: entryToInsert });

    } catch (error) {
      console.error('Error creating user habit entry:', error);
      // Handle invalid date format or other insertion errors
       if (error instanceof RangeError || error instanceof TypeError) {
           res.status(400).json({ message: 'Invalid date format provided.' });
       } else {
            res.status(500).json({ message: 'Failed to create user habit entry.', error: error.message });
       }
    }
});
// --- End of API route to create a new userHabitEntry ---

// --- API route to create a new groupHabitEntry ---
app.post('/api/groupHabitEntries', async (req, res) => {
    // Get the database connection
    const db = req.app.locals.db;

    // Check if the database connection is available
    if (!db) {
      res.status(500).json({ message: 'Database not connected.' });
      return;
    }

    // Get the groupHabitEntries collection
    const collection = db.collection('groupHabitEntries'); // *** Assuming collection name ***

    // Get the entry data from the request body
    const newEntryData = req.body;

    // Basic validation (requires habitId, groupId, date)
    if (!newEntryData || !newEntryData.habitId || !newEntryData.groupId || !newEntryData.date) {
      res.status(400).json({ message: 'Missing required entry data (habitId, groupId, or date).' });
      return;
    }

    // Prepare entry document for insertion
    try {
         // Optional: Check if IDs are valid ObjectId strings before conversion
         if (!ObjectId.isValid(newEntryData.habitId) || !ObjectId.isValid(newEntryData.groupId)) {
             res.status(400).json({ message: 'Invalid ID format for habitId or groupId.' });
             return;
         }
         if (newEntryData.checkedBy) {
             for (const id of newEntryData.checkedBy) {
                 if (!ObjectId.isValid(id)) {
                     res.status(400).json({ message: `Invalid checkedBy ID format: ${id}` });
                     return;
                 }
             }
         }

        const entryToInsert = {
            habitId: new ObjectId(newEntryData.habitId), // Convert habitId string to ObjectId
            groupId: new ObjectId(newEntryData.groupId),   // Convert groupId string to ObjectId
            date: new Date(newEntryData.date), // Convert date string/timestamp to Date object
            // Initialize checkedBy and notes if not provided, and convert checkedBy IDs
            checkedBy: newEntryData.checkedBy ? newEntryData.checkedBy.map(id => new ObjectId(id)) : [],
            notes: newEntryData.notes || {},
            // MongoDB will automatically add the _id field
        };

        const result = await collection.insertOne(entryToInsert);

        res.status(201).json({ message: 'Group habit entry created successfully!', insertedId: result.insertedId, insertedEntry: entryToInsert });

    } catch (error) {
      console.error('Error creating group habit entry:', error);
      // Handle invalid date format or other insertion errors
       if (error instanceof RangeError || error instanceof TypeError) {
           res.status(400).json({ message: 'Invalid date format provided.' });
       } else {
           res.status(500).json({ message: 'Failed to create group habit entry.', error: error.message });
       }
    }
});
// --- End of API route to create a new groupHabitEntry ---

// --- API route to get personal habits for a user ---
app.get('/api/users/:userId/habits', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the user ID from the URL parameters
  const userId = req.params.userId;

  // Basic validation
  if (!userId) {
    res.status(400).json({ message: 'Missing user ID in parameters.' });
    return;
  }

  try {
    // Optional: Check if userId is a valid ObjectId string before conversion
    if (!ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'Invalid user ID format.' });
        return;
    }
    const userObjectId = new ObjectId(userId);

    // Get the habits collection
    const collection = db.collection('habits'); // *** Assuming your collection name is 'habits' ***

    // Find habits where the user is the creator OR assigned (and it's a personal assignment)
    // Adjust query based on how you distinguish personal habits from group habits.
    // Assuming personal habits have assignedTo.type === 'user' and createdBy is the user.
    const personalHabits = await collection.find({
        $or: [
            { createdBy: userObjectId },
            { 'assignedTo.id': userObjectId, 'assignedTo.type': 'user' }
        ]
    }).toArray();

    res.status(200).json(personalHabits);

  } catch (error) {
    console.error('Error fetching personal habits:', error);
    res.status(500).json({ message: 'Failed to fetch personal habits.', error: error.message });
  }
});
// --- End of API route to get personal habits ---

// --- API route to get groups a user is a member of ---
app.get('/api/users/:userId/groups', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the user ID from the URL parameters
  const userId = req.params.userId;

  // Basic validation
  if (!userId) {
    res.status(400).json({ message: 'Missing user ID in parameters.' });
    return;
  }

  try {
    // Optional: Check if userId is a valid ObjectId string before conversion
    if (!ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'Invalid user ID format.' });
        return;
    }
    const userObjectId = new ObjectId(userId);

    // Get the groups collection
    const collection = db.collection('groups'); // *** Assuming your collection name is 'groups' ***

    // Find groups where the user's ID is in the memberIds array
    const userGroups = await collection.find({
        memberIds: userObjectId // MongoDB can query for an element in an array field
    }).toArray();

    res.status(200).json(userGroups);

  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({ message: 'Failed to fetch user groups.', error: error.message });
  }
});
// --- End of API route to get user groups ---

// --- API route to get habits for a specific group ---
app.get('/api/groups/:groupId/habits', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the group ID from the URL parameters
  const groupId = req.params.groupId;

  // Basic validation
  if (!groupId) {
    res.status(400).json({ message: 'Missing group ID in parameters.' });
    return;
  }

  try {
    // Optional: Check if groupId is a valid ObjectId string before conversion
    if (!ObjectId.isValid(groupId)) {
        res.status(400).json({ message: 'Invalid group ID format.' });
        return;
    }
    const groupObjectId = new ObjectId(groupId);

    // Get the habits collection
    const collection = db.collection('habits'); // *** Assuming your collection name is 'habits' ***

    // Find habits where assignedTo.type is 'group' and assignedTo.id is the groupId
    const groupHabits = await collection.find({
        'assignedTo.type': 'group',
        'assignedTo.id': groupObjectId
    }).toArray();

    res.status(200).json(groupHabits);

  } catch (error) {
    console.error('Error fetching group habits:', error);
    res.status(500).json({ message: 'Failed to fetch group habits.', error: error.message });
  }
});
// --- End of API route to get group habits ---

// --- API route to check Authentication Status (Verify JWT) ---
app.get('/api/auth/status', async (req, res) => {
  // Get the token from the Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN

  // If no token, user is not authenticated
  if (token == null) {
    return res.sendStatus(401); // Unauthorized
  }

  // Verify the token
  jwt.verify(token, jwtSecret, async (err, userPayload) => {
    if (err) {
      // Token is invalid (e.g., expired, wrong signature)
      console.error('JWT verification failed:', err.message);
      return res.sendStatus(403); // Forbidden (invalid token)
    }

    // --- Token is valid! ---
    // userPayload contains the decoded data from the token (e.g., { id: user._id, username: user.username })
    
    // Optional: Fetch more user data from DB using userPayload.id if needed
    const db = req.app.locals.db;
    if (!db) {
      console.error('Database not connected in /api/auth/status.');
      return res.sendStatus(500); // Internal Server Error
    }

    const collection = db.collection('users');
    try {
        // Fetch user data, excluding the password
        const user = await collection.findOne({ _id: new ObjectId(userPayload.id) }, { projection: { password: 0 } });

        if (!user) {
            // User found in token but not in DB? (Shouldn't happen often if token payload is correct)
            return res.sendStatus(404); // Not Found
        }

        // User is authenticated and found in DB - send success response with user info
        res.json({ isAuthenticated: true, user });

    } catch (dbError) {
        console.error('Database error fetching user in /api/auth/status:', dbError);
        res.sendStatus(500); // Internal Server Error
    }
  });
});
// --- End of API route to check Authentication Status ---

// --- API route for User Logout ---
// In a stateless JWT system, logout is often handled client-side by discarding the token.
// A backend logout route might be needed for token blacklisting or session management if not using stateless JWTs strictly.
// For now, we'll add a basic endpoint, but note its typical stateless nature.
app.post('/api/auth/logout', (req, res) => {
  // If using stateless JWTs, there's nothing to do on the server side other than confirming receipt.
  // If using refresh tokens or server-side sessions, logic to invalidate them would go here.

  // Frontend is responsible for discarding the token.
  res.json({ message: 'Logout successful (client-side token discarded).' });
});
// --- End of API route for User Logout ---

// --- API route to get user habit entries for a specific user and date ---
app.get('/api/users/:userId/habitEntries/:date', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the parameters from the URL
  const userId = req.params.userId;
  const dateString = req.params.date; // Date in YYYY-MM-DD format (or similar)

  // Basic validation
  if (!userId || !dateString) {
    res.status(400).json({ message: 'Missing user ID or date in parameters.' });
    return;
  }

  try {
    // Validate and convert user ID to ObjectId
    if (!ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'Invalid user ID format.' });
        return;
    }
    const userObjectId = new ObjectId(userId);

    // Convert date string to a Date object, representing the start of the day in UTC
    // We use start of day and end of day to query for entries within that 24-hour period
    const startOfDay = new Date(dateString);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dateString);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // Get the userHabitEntries collection
    const collection = db.collection('userHabitEntries'); // *** Assuming collection name ***

    // Find entries for the specific user on the given date
    const entries = await collection.find({
        userId: userObjectId,
        date: {
            $gte: startOfDay,
            $lte: endOfDay
        }
    }).toArray();

    // Respond with the found entries
    res.status(200).json(entries);

  } catch (error) {
    console.error('Error fetching user habit entries:', error);
     // Handle invalid date format gracefully
    if (error instanceof RangeError || error instanceof TypeError) {
        res.status(400).json({ message: 'Invalid date format provided. Use YYYY-MM-DD.' });
    } else {
        res.status(500).json({ message: 'Failed to fetch user habit entries.', error: error.message });
    }
  }
});
// --- End of API route to get user habit entries ---

// --- API route to get group habit entries for a specific group and date ---
app.get('/api/groups/:groupId/habitEntries/:date', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the parameters from the URL
  const groupId = req.params.groupId;
  const dateString = req.params.date; // Date in YYYY-MM-DD format (or similar)

  // Basic validation
  if (!groupId || !dateString) {
    res.status(400).json({ message: 'Missing group ID or date in parameters.' });
    return;
  }

  try {
    // Validate and convert group ID to ObjectId
    if (!ObjectId.isValid(groupId)) {
        res.status(400).json({ message: 'Invalid group ID format.' });
        return;
    }
    const groupObjectId = new ObjectId(groupId);

    // Convert date string to a Date object, representing the start of the day in UTC
    const startOfDay = new Date(dateString);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dateString);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // Get the groupHabitEntries collection
    const collection = db.collection('groupHabitEntries'); // *** Assuming collection name ***

    // Find entries for the specific group on the given date
    const entries = await collection.find({
        groupId: groupObjectId,
        date: {
            $gte: startOfDay,
            $lte: endOfDay
        }
    }).toArray();

    // Respond with the found entries
    res.status(200).json(entries);

  } catch (error) {
    console.error('Error fetching group habit entries:', error);
     // Handle invalid date format gracefully
    if (error instanceof RangeError || error instanceof TypeError) {
        res.status(400).json({ message: 'Invalid date format provided. Use YYYY-MM-DD.' });
    } else {
        res.status(500).json({ message: 'Failed to fetch group habit entries.', error: error.message });
    }
  }
});
// --- End of API route to get group habit entries ---

// --- API route to get group members with completion status for a specific date ---
app.get('/api/groups/:groupId/members/completion/:date', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the parameters from the URL
  const groupId = req.params.groupId;
  const dateString = req.params.date; // Date in YYYY-MM-DD format

  // Basic validation
  if (!groupId || !dateString) {
    res.status(400).json({ message: 'Missing group ID or date in parameters.' });
    return;
  }

  try {
    // Validate and convert group ID to ObjectId
    if (!ObjectId.isValid(groupId)) {
        res.status(400).json({ message: 'Invalid group ID format.' });
        return;
    }
    const groupObjectId = new ObjectId(groupId);

    // Convert date string to a Date object range for querying entries
    const startOfDay = new Date(dateString);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dateString);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // Get the groups, users, groupHabitEntries, and habits collections
    const groupsCollection = db.collection('groups');
    const usersCollection = db.collection('users');
    const groupHabitEntriesCollection = db.collection('groupHabitEntries');
    const habitsCollection = db.collection('habits');

    // 1. Find the group to get its members
    const group = await groupsCollection.findOne({ _id: groupObjectId });

    if (!group) {
      res.status(404).json({ message: 'Group not found.' });
      return;
    }

    const memberIds = group.memberIds;

    // 2. Find the users corresponding to the memberIds
    // Exclude sensitive information like password
    const members = await usersCollection.find(
        { _id: { $in: memberIds } },
        { projection: { password: 0 } } // Exclude password field
    ).toArray();

    // 3. Find all habits assigned to this group to get the total count
    const groupHabits = await habitsCollection.find({
        'assignedTo.type': 'group',
        'assignedTo.id': groupObjectId
    }).toArray();
    const totalGroupHabits = groupHabits.length;

    // 4. Find all group habit entries for this group on the given date
    const completedEntries = await groupHabitEntriesCollection.find({
        groupId: groupObjectId,
        date: {
            $gte: startOfDay,
            $lte: endOfDay
        }
    }).toArray();

    // 5. Process completion entries to count completed habits per user
    const userCompletionCounts = {};
    completedEntries.forEach(entry => {
        // Ensure entry.userId exists and is a string/can be used as a key
        const userIdString = entry.userId.toString();
        if (!userCompletionCounts[userIdString]) {
            userCompletionCounts[userIdString] = new Set();
        }
        // Use habitId to count unique completed habits per user
        userCompletionCounts[userIdString].add(entry.habitId.toString());
    });

    // 6. Combine member data with their completion counts
    const membersWithCompletion = members.map(member => {
        const memberIdString = member._id.toString();
        const completedCount = userCompletionCounts[memberIdString] ? userCompletionCounts[memberIdString].size : 0;
        return {
            ...member,
            completedGroupHabits: completedCount,
            totalGroupHabits: totalGroupHabits
        };
    });

    // Respond with the group members and their completion status
    res.status(200).json(membersWithCompletion);

  } catch (error) {
    console.error('Error fetching group members with completion status:', error);
     // Handle invalid date format gracefully
    if (error instanceof RangeError || error instanceof TypeError) {
        res.status(400).json({ message: 'Invalid date format provided. Use YYYY-MM-DD.' });
    } else {
        res.status(500).json({ message: 'Failed to fetch group members with completion status.', error: error.message });
    }
  }
});
// --- End of API route to get group members with completion status ---

// --- API route to get the most logged habit for a user ---
app.get('/api/users/:userId/mostLoggedHabit', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the user ID from the URL parameters
  const userId = req.params.userId;

  // Basic validation
  if (!userId) {
    res.status(400).json({ message: 'Missing user ID in parameters.' });
    return;
  }

  try {
    // Validate and convert user ID to ObjectId
    if (!ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'Invalid user ID format.' });
        return;
    }
    const userObjectId = new ObjectId(userId);

    // Get the userHabitEntries and habits collections
    const userHabitEntriesCollection = db.collection('userHabitEntries'); // *** Assuming collection name ***
    const habitsCollection = db.collection('habits'); // *** Assuming collection name ***

    // MongoDB Aggregation Pipeline
    const pipeline = [
      {
        $match: {
          userId: userObjectId // Filter entries for the specific user
        }
      },
      {
        $group: {
          _id: '$habitId', // Group by habitId
          count: { $sum: 1 } // Count occurrences of each habit
        }
      },
      {
        $sort: {
          count: -1 // Sort by count descending (most frequent first)
        }
      },
      {
        $lookup: {
          from: 'habits', // Join with the habits collection
          localField: '_id', // The habitId from the grouped entries
          foreignField: '_id', // The _id from the habits collection
          as: 'habitDetails' // Output array field name
        }
      },
      {
        $unwind: '$habitDetails' // Deconstruct the habitDetails array
      },
      {
        // Re-sort to handle ties by habit creation date (assuming a 'createdAt' field)
        // Sort by count descending first, then createdAt ascending
        $sort: {
          count: -1,
          'habitDetails.createdAt': 1 // Assuming 'createdAt' field exists on habit documents
        }
      },
      {
        $limit: 1 // Get only the top result
      },
      {
        $project: {
          _id: '$habitDetails._id',
          title: '$habitDetails.title',
          // Include other habit fields you need in the response
          // e.g., description: '$habitDetails.description',
          // assignedTo: '$habitDetails.assignedTo',
          // schedule: '$habitDetails.schedule',
          // createdBy: '$habitDetails.createdBy',
          completionCount: '$count' // Include the count of entries for this habit
        }
      }
    ];

    const result = await userHabitEntriesCollection.aggregate(pipeline).toArray();

    if (result.length > 0) {
      res.status(200).json(result[0]);
    } else {
      // No habit entries found for this user
      res.status(404).json({ message: 'No logged habits found for this user.' });
    }

  } catch (error) {
    console.error('Error fetching most logged habit:', error);
    res.status(500).json({ message: 'Failed to fetch most logged habit.', error: error.message });
  }
});
// --- End of API route to get the most logged habit ---

// --- API route to get the account creation date for a user ---
app.get('/api/users/:userId/createdAt', async (req, res) => {
  // Get the database connection
  const db = req.app.locals.db;

  // Check if the database connection is available
  if (!db) {
    res.status(500).json({ message: 'Database not connected.' });
    return;
  }

  // Get the user ID from the URL parameters
  const userId = req.params.userId;

  // Basic validation
  if (!userId) {
    res.status(400).json({ message: 'Missing user ID in parameters.' });
    return;
  }

  try {
    // Validate and convert user ID to ObjectId
    if (!ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'Invalid user ID format.' });
        return;
    }
    const userObjectId = new ObjectId(userId);

    // Get the users collection
    const usersCollection = db.collection('users'); // *** Assuming collection name ***

    // Find the user and project only the createdAt field
    const user = await usersCollection.findOne(
        { _id: userObjectId },
        { projection: { createdAt: 1 } } // Project only the createdAt field
    );

    if (user) {
      // Return the createdAt date
      res.status(200).json({ createdAt: user.createdAt });
    } else {
      // User not found
      res.status(404).json({ message: 'User not found.' });
    }

  } catch (error) {
    console.error('Error fetching user creation date:', error);
    res.status(500).json({ message: 'Failed to fetch user creation date.', error: error.message });
  }
});
// --- End of API route to get the account creation date ---

// --- Password Reset Flow (More complex - requires email service) ---
// POST /api/auth/forgot-password - Initiates reset (sends email with token)

// --- Email Verification Flow (More complex - requires email service) ---
// POST /api/auth/verify-email - Verifies email using a token sent after signup


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