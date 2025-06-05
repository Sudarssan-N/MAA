const express = require('express');
const jsforce = require('jsforce');
const { OpenAI } = require('openai');
require('dotenv').config();
const cors = require('cors');
const session = require('express-session');

const app = express();
app.use(express.json());

// Enable CORS with more permissive settings for development
const corsOptions = {
  origin: function (origin, callback) {
    console.log('Origin making request:', origin);
    // Allow all origins for development
    callback(null, true);
    
    // For production, you should uncomment and modify this:
    // const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:55032', 'http://localhost:55032'];
    // if (!origin || allowedOrigins.indexOf(origin) !== -1) {
    //   callback(null, true);
    // } else {
    //   callback(new Error('Not allowed by CORS'));
    // }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 3600000
  }
}));

const STATIC_USERNAME = process.env.STATIC_USERNAME || 'Jack Rogers';
const STATIC_PASSWORD = process.env.STATIC_PASSWORD || 'password123';
const SALESFORCE_ACCESS_TOKEN = process.env.SALESFORCE_ACCESS_TOKEN;
const SALESFORCE_INSTANCE_URL = process.env.SALESFORCE_INSTANCE_URL;
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In the backend (index.js)
const productMapping = {
  "checking_account": [
    { name: "Everyday Checking", description: "A versatile checking account for daily transactions.", key: "checking_account" },
    { name: "Clear Access Banking", description: "Prevent overspending with balance-based limits.", key: "checking_account" },
    { name: "Student/Teen Banking", description: "A checking account designed for younger customers.", key: "checking_account" },
  ],
  "savings_account": [
    { name: "Way2Save® Savings", description: "Build your savings with automatic transfers.", key: "savings_account" },
    { name: "Platinum Savings", description: "Earn higher interest on your savings.", key: "savings_account" },
    { name: "Certificates of Deposit", description: "Secure a guaranteed return over a fixed term.", key: "savings_account" },
  ],
  "credit_card": [
    { name: "Cash Back Credit Card", description: "Earn cash back on everyday purchases.", key: "credit_card" },
    { name: "0% Intro APR Credit Card", description: "Manage spending with no interest for an introductory period.", key: "credit_card" },
    { name: "Rewards Credit Card", description: "Earn points or miles for travel and perks.", key: "credit_card" },
    { name: "Balance Transfer Credit Card", description: "Consolidate debt with a low introductory APR.", key: "credit_card" },
  ],
  "personal_loan": [
    { name: "Personal Loan", description: "Finance your needs with a fixed-rate loan.", key: "personal_loan" },
  ],
  "digital_banking": [
    { name: "Digital Banking Tools", description: "Manage your finances with our online and mobile app.", key: "digital_banking" },
  ],
};

// Default recommendations if no match is found
const defaultRecommendations = [
  { name: "Everyday Checking", description: "A versatile checking account for daily transactions.", key: "checking_account" },
  { name: "Way2Save® Savings", description: "Build your savings with automatic transfers.", key: "savings_account" },
  { name: "Digital Banking Tools", description: "Manage your finances with our online and mobile app.", key: "digital_banking" },
];

const getSalesforceConnection = () => {
  console.log('Attempting to establish Salesforce connection');
  if (!SALESFORCE_ACCESS_TOKEN || !SALESFORCE_INSTANCE_URL) {
    console.error('Salesforce credentials missing in environment');
    throw new Error('Salesforce credentials not configured in environment');
  }
  const conn = new jsforce.Connection({
    instanceUrl: SALESFORCE_INSTANCE_URL,
    accessToken: SALESFORCE_ACCESS_TOKEN,
  });
  console.log('Salesforce connection established successfully');
  return conn;
};

// Helper function to format ISO 8601 date/time into a readable format
function formatDateTimeForDisplay(isoDateTime) {
  console.log('Formatting date/time for display:', isoDateTime);
  if (!isoDateTime) return 'Not specified';

  const date = new Date(isoDateTime);
  const options = {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  let formatted = date.toLocaleString('en-US', options);
  formatted = formatted.replace(/(\d+),/, '$1th,');
  console.log('Formatted date/time:', formatted);
  return formatted;
}

function extractJSON(str) {
  console.log('Extracting JSON from string:', str);
  const codeBlockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/;
  const codeBlockMatch = str.match(codeBlockRegex);
  
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      console.log('Successfully parsed JSON from code block:', parsed);
      return codeBlockMatch[1];
    } catch (e) {
      console.error('Error parsing JSON from code block:', e.message);
    }
  }
  
  const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
  const matches = str.match(jsonRegex);
  
  if (matches) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        console.log('Successfully parsed JSON from regex match:', parsed);
        return match;
      } catch (e) {
        console.error('Error parsing JSON from regex match:', e.message);
      }
    }
  }
  
  console.log('No valid JSON found, returning empty object');
  return '{}';
}

function initGuidedFlowSession(req) {
  if (!req.session.guidedFlow) {
    req.session.guidedFlow = {
      reason: null,
      date: null,
      time: null,
      location: null
    };
  }
}

function getMostFrequent(arr) {
  console.log('Calculating most frequent value in array:', arr);
  if (!arr.length) {
    console.log('Array is empty, returning null');
    return null;
  }
  const counts = arr.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
  const result = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  console.log('Most frequent value:', result);
  return result;
}

function convertTo24HourTime(timeStr) {
  console.log('Converting time to 24-hour format:', timeStr);
  if (!timeStr) {
    console.log('No time string provided, returning null');
    return null;
  }

  const isoRegex = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d{3}Z$/;
  const isoMatch = timeStr.match(isoRegex);
  if (isoMatch) {
    console.log('Time is already in ISO 8601 format, returning:', isoMatch[1]);
    return isoMatch[1];
  }

  const trimmedTimeStr = timeStr.trim();
  const timeRegex = /^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i;
  const match = trimmedTimeStr.match(timeRegex);

  if (!match) {
    console.log('Invalid time format, expected HH:MM AM/PM or HH:MM:', trimmedTimeStr);
    return null;
  }

  let [_, hours, minutes, modifier] = match;
  hours = parseInt(hours, 10);
  minutes = minutes ? parseInt(minutes, 10) : 0;

  if (hours > 23 || hours < 0 || minutes > 59 || minutes < 0) {
    console.log('Time out of range:', { hours, minutes });
    return null;
  }

  if (modifier) {
    modifier = modifier.toUpperCase();
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
  }

  const result = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  console.log('Converted to 24-hour format:', result);
  return result;
}

function combineDateTime(dateStr, timeStr) {
  console.log('Combining date and time:', { dateStr, timeStr });
  if (!dateStr || !timeStr) {
    console.log('Missing date or time, returning null');
    return null;
  }

  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (isoRegex.test(timeStr)) {
    console.log('Time is already in ISO 8601 format, returning:', timeStr);
    return timeStr;
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    console.log('Invalid date format, expected YYYY-MM-DD:', dateStr);
    return null;
  }

  const time24 = convertTo24HourTime(timeStr);
  if (!time24) {
    console.log('Invalid time format, returning null');
    return null;
  }

  const result = `${dateStr}T${time24}.000Z`;
  console.log('Combined DateTime:', result);
  return result;
}

function parseDateTimeString(dateTimeStr) {
  console.log('Parsing date/time string:', dateTimeStr);
  if (!dateTimeStr) return { date: null, time: null };

  // Example format: "October 27, 2023, 09:30 AM"
  const parts = dateTimeStr.match(/(\w+ \d{1,2}, \d{4}), (\d{1,2}:\d{2} [AP]M)/i);
  if (!parts) {
    console.log('Invalid date/time format:', dateTimeStr);
    return { date: null, time: null };
  }

  const [, datePart, timePart] = parts;

  // Parse the date part (e.g., "October 27, 2023") into YYYY-MM-DD
  const dateObj = new Date(datePart);
  if (isNaN(dateObj.getTime())) {
    console.log('Invalid date part:', datePart);
    return { date: null, time: null };
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  return { date: dateStr, time: timePart };
}

const authenticate = (req, res, next) => {
  console.log('Authenticating request, session user:', req.session.user);
  if (!req.session.user || req.session.user.username !== STATIC_USERNAME) {
    console.log('Authentication failed: Unauthorized');
    return res.status(401).json({ message: 'Unauthorized: Please log in as Jack Rogers' });
  }
  console.log('Authentication successful');
  next();
};

const optionalAuthenticate = (req, res, next) => {
  console.log('Optional authentication, session user:', req.session.user);
  if (!req.session.user) {
    req.user = { username: 'guest' };
    console.log('No session user, setting as guest');
  } else {
    req.user = req.session.user;
    console.log('Using session user:', req.user);
  }
  next();
};

app.post('/api/auth/login', (req, res) => {
  console.log('Login request received:', req.body);
  const { username, password } = req.body;

  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({ message: 'Missing username or password' });
  }
  if (username !== STATIC_USERNAME || password !== STATIC_PASSWORD) {
    console.log('Invalid credentials');
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  req.session.user = { username };
  console.log('User logged in, session updated:', req.session.user);
  res.json({ message: 'Login successful', username });
});

app.get('/api/session-health', (req, res) => {
  console.log('Checking session health');
  if (req.session && req.session.id) {
    console.log('Session is healthy:', req.session.id);
    res.status(200).json({ status: 'healthy' });
  } else {
    console.log('Session is unhealthy or expired');
    res.status(401).json({ status: 'unhealthy', error: 'SESSION_EXPIRED' });
  }
});

app.get('/api/auth/check-session', (req, res) => {
  console.log('Checking session status');
  if (req.session.user && req.session.user.username === STATIC_USERNAME) {
    console.log('Session active for user:', req.session.user.username);
    res.json({ username: req.session.user.username });
  } else {
    console.log('No active session found');
    res.status(401).json({ message: 'Not logged in' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  console.log('Logout request received');
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ message: 'Failed to log out' });
    }
    console.log('Session destroyed, clearing cookie');
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/salesforce/appointments', authenticate, async (req, res) => {
  console.log('Fetching Salesforce appointments for Contact__c: 003dM000005H5A7QAK');
  try {
    const conn = getSalesforceConnection();
    const query = 'SELECT Id, Reason_for_Visit__c, Appointment_Date__c, Appointment_Time__c, Location__c FROM Appointment__c WHERE Contact__c = \'003dM000005H5A7QAK\'';
    console.log('Executing Salesforce query:', query);
    const result = await conn.query(query);
    console.log('Salesforce data retrieved:', JSON.stringify(result.records, null, 2));
    res.json(result.records);
  } catch (error) {
    console.error('Error fetching appointments:', error.message);
    res.status(500).json({ message: 'Failed to fetch appointments', error: error.message });
  }
});

app.post('/api/salesforce/appointments', authenticate, async (req, res) => {
  console.log('Received request to create appointment:', JSON.stringify(req.body, null, 2));
  try {
    const conn = getSalesforceConnection();
    const appointmentData = {
      ...req.body,
      Contact__c: '003dM000005H5A7QAK'
    };
    console.log('Salesforce appointment data to create:', JSON.stringify(appointmentData, null, 2));
    const result = await conn.sobject('Appointment__c').create(appointmentData);
    if (result.success) {
      console.log('Appointment created successfully with ID:', result.id);
      res.json({ message: 'Appointment created', id: result.id });
    } else {
      console.error('Failed to create appointment:', result);
      res.status(500).json({ message: 'Failed to create appointment' });
    }
  } catch (error) {
    console.error('Error creating appointment:', error.message);
    res.status(500).json({ message: 'Failed to create appointment', error: error.message });
  }
});

app.post('/api/guidedFlow', async (req, res) => {
  try {
    const { query, customerType, guidedStep } = req.body;
    if (!query || !customerType || !guidedStep) {
      return res.status(400).json({ message: 'Missing query, customerType, or guidedStep' });
    }

    if (!req.session) {
      return res.status(401).json({ message: 'Session expired or invalid', error: 'SESSION_EXPIRED' });
    }

    // Initialize the guided flow data if not present
    initGuidedFlowSession(req);

    // We'll store the partial data in session so we can finalize at the "confirmation" step
    const flowData = req.session.guidedFlow;  // { reason, date, time, location }

    // We'll build a specialized system prompt based on the guidedStep
    let systemInstructions = '';
    switch (guidedStep) {
      case 'reasonSelection':
        // LLM can propose times based on the reason
        flowData.reason = query;  // store the reason in session
        systemInstructions = `
User selected a reason: ${flowData.reason}.
Please suggest 3 possible appointment date/time slots in ISO 8601 format (e.g., "2025-03-10T16:00:00.000Z").
Return them under "timeSlots" array in JSON.
Start the Dates from 16 march 2025 it is.
Include a "response" that politely offers those slots, plus an "alternateDatesOption" if you wish.
        `;
        break;

      case 'timeSelection':
        // The user presumably picks from the LLM-suggested times
        flowData.time = query;  // store the chosen time in session (should be in ISO 8601 format)
        systemInstructions = `
User selected the time slot: ${flowData.time}.
Now we must gather the location. Provide 3 location options in "locationOptions": ["Brooklyn","Manhattan","New York"].
Return them in a JSON array. Also provide a "response" to ask the user to choose a location.
        `;
        break;

      case 'locationSelection':
        // The user picks a location
        flowData.location = query;  // store the chosen location in session
        systemInstructions = `
User selected location: ${flowData.location}.
Now we have reason = ${flowData.reason}, time = ${flowData.time}, location = ${flowData.location}.
Return a "response" summarizing these choices and ask for confirmation. 
Include something like "Please confirm your appointment."
        `;
        break;

      case 'confirmation':
        // The user confirms the final details. Now we create the appointment in Salesforce.
        systemInstructions = `
The user confirmed the appointment with reason = ${flowData.reason}, time = ${flowData.time}, location = ${flowData.location}.
Return a short "response" that the appointment is being booked. 
        `;
        break;

      default:
        systemInstructions = 'No recognized guided step.';
        break;
    }

    // Add system prompt
    if (!req.session.chatHistory) {
      req.session.chatHistory = [];
    }
    req.session.chatHistory.push({ role: 'system', content: systemInstructions });
    req.session.chatHistory.push({ role: 'user', content: query });

    // Call OpenAI with your messages
    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: req.session.chatHistory,
      max_tokens: 500,
      temperature: 0.7,
    });

    const llmOutput = openaiResponse.choices[0].message.content.trim();
    req.session.chatHistory.push({ role: 'assistant', content: llmOutput });
    req.session.save(() => {});

    // Attempt to parse the LLM JSON
    let parsed;
    try {
      parsed = JSON.parse(llmOutput);
    } catch (err) {
      parsed = JSON.parse(extractJSON(llmOutput));
    }

    // Format timeSlots for display
    let formattedTimeSlots = [];
    if (parsed.timeSlots && Array.isArray(parsed.timeSlots)) {
      formattedTimeSlots = parsed.timeSlots.map(slot => ({
        display: formatDateTimeForDisplay(slot),
        raw: slot
      }));
    }

    // If we're at confirmation, create the record in Salesforce
    let appointmentDetails = null;
    if (guidedStep === 'confirmation') {
      try {
        // Since flowData.time is already in ISO 8601 format (e.g., "2023-10-27T16:00:00.000Z")
        const dateTime = flowData.time;
        if (!dateTime) {
          console.error('Missing date/time in confirmation step');
          throw new Error('Invalid date/time format');
        }

        // Create the record in SF
        const conn = getSalesforceConnection();
        const newAppointment = {
          Reason_for_Visit__c: flowData.reason,
          Appointment_Time__c: dateTime,
          Location__c: flowData.location,
          Contact__c: '003dM000005H5A7QAK'
        };
        const result = await conn.sobject('Appointment__c').create(newAppointment);

        if (result.success) {
          appointmentDetails = {
            Id: result.id,
            Reason_for_Visit__c: flowData.reason,
            Appointment_Time__c: dateTime,
            Location__c: flowData.location
          };
        } else {
          console.error('SF creation failed:', result);
          throw new Error('Failed to create appointment in Salesforce');
        }

        // Clear the session data
        req.session.guidedFlow = { reason: null, date: null, time: null, location: null };
      } catch (error) {
        console.error('Error creating appointment in SF:', error);
        return res.status(500).json({ message: 'Failed to create appointment', error: error.message });
      }
    }

    // Return the LLM's response plus any additional data
    const responsePayload = {
      response: parsed.response || '...',
      appointmentDetails: appointmentDetails || parsed.appointmentDetails || null,
      timeSlots: formattedTimeSlots,
      locationOptions: parsed.locationOptions || [],
      alternateDatesOption: parsed.alternateDatesOption || null
    };

    return res.json(responsePayload);

  } catch (error) {
    console.error('Error in /api/guidedFlow:', error);
    return res.status(500).json({ message: 'Error in guidedFlow', error: error.message });
  }
});

app.post('/api/chat', optionalAuthenticate, async (req, res) => {
  console.log('Received chat request:', JSON.stringify(req.body, null, 2));
  try {
    const { query, customerType } = req.body;
    if (!query || !customerType) {
      console.log('Missing query or customerType');
      return res.status(400).json({ message: 'Missing query or customerType' });
    }

    if (!req.session) {
      console.error('No session object found');
      return res.status(401).json({ message: 'Session expired or invalid', error: 'SESSION_EXPIRED', recovery: true });
    }

    if (!req.session.chatHistory) {
      req.session.chatHistory = [
        { 
          role: 'system', 
          content: 'You are a friendly, proactive bank appointment assistant. Use natural language to guide the user, suggest appointment details based on context, and ask for clarification only when needed. Return responses in JSON with "response" (natural language) and "appointmentDetails" (structured data).' 
        }
      ];
      console.log('Initialized chat history:', JSON.stringify(req.session.chatHistory, null, 2));
    }

    // Predefined response for "Find me a branch within 5 miles with 24hrs Drive-thru ATM service" as a future capability
    const branchQuery = "Find me a branch within 5 miles with 24hrs Drive-thru ATM service";
    if (query.toLowerCase().includes(branchQuery.toLowerCase())) {
      console.log('Detected predefined branch query');
      const predefinedResponse = {
        response: "I found a branch that meets your criteria. It's located at 123 Main St, Brooklyn, NY 11201. If you would like to Navigate there here is the link: https://goo.gl/maps/12345",
        appointmentDetails: null,
        missingFields: []
      };
      req.session.chatHistory.push({ role: 'user', content: query });
      req.session.chatHistory.push({ role: 'assistant', content: JSON.stringify(predefinedResponse) });
      console.log('Updated chat history with predefined response:', JSON.stringify(req.session.chatHistory, null, 2));
      req.session.save((err) => {
        if (err) console.error('Error saving session:', err);
        else console.log('Session saved successfully');
      });
      return res.json(predefinedResponse);
    }

    let conn;
    try {
      conn = getSalesforceConnection();
    } catch (error) {
      console.error('Error connecting to Salesforce:', error.message);
      return res.status(500).json({ message: 'Salesforce connection failed' });
    }

    let contextData = '';
    let previousAppointments = [];
    const isRegularCustomer = customerType === 'Regular' || customerType === 'customer';
    console.log('Customer type:', customerType, 'Is regular:', isRegularCustomer);

    if (isRegularCustomer) {
      const query = 'SELECT Id, Reason_for_Visit__c, Appointment_Date__c, Appointment_Time__c, Location__c, Banker__c, CreatedDate ' +
                    'FROM Appointment__c WHERE Contact__c = \'003dM000005H5A7QAK\' ORDER BY CreatedDate DESC';
      console.log('Executing Salesforce query for previous appointments:', query);
      const result = await conn.query(query);
      previousAppointments = result.records;
      console.log('Retrieved previous appointments:', JSON.stringify(previousAppointments, null, 2));

      if (previousAppointments.length > 0) {
        contextData = 'Previous Appointments:\n' + previousAppointments.map((r, i) => {
          return `Appointment ${i + 1}:
Reason: ${r.Reason_for_Visit__c || 'Not specified'}
Date: ${r.Appointment_Date__c || 'Not specified'}
Time: ${r.Appointment_Time__c || 'Not specified'}
Location: ${r.Location__c || 'Not specified'}
Banker ID: ${r.Banker__c || 'Not specified'}`;
        }).join('\n\n');

        const bankers = previousAppointments.map(r => r.Banker__c).filter(Boolean);
        if (bankers.length > 0) {
          contextData += `\nPreferred Banker ID: a0AdM000002ZcsUUAS`;
          contextData += `\nPreferred Banker Name: George`;
        }

        const locations = previousAppointments.map(r => r.Location__c).filter(Boolean);
        if (locations.length > 0) {
          contextData += `\nPreferred Location use only: Brooklyn`;
        }
        console.log('Generated context data:', contextData);
      }
    }

    req.session.chatHistory.push({ role: 'user', content: query });
    console.log('Added user query to chat history:', JSON.stringify(req.session.chatHistory, null, 2));

    const prompt = `
   You are a smart, human-like, and proactive bank appointment assistant.

**Your goals:**
- Greet users warmly with "Hey ${
      req.session.user?.username || "there"
    },only in start of conversation"
- Reply in 1–2 crisp, helpful lines using natural and empathetic tone
- Understand the user's urgency, patterns, and preferences
- Personalize recommendations using appointment history, behavior, and context
- If appointment is confirmed, add a friendly reminder to bring required documents (e.g., ID proof, address proof, recent statements)

**Your behavior must include:**
- Suggest earlier slots if the scenario is urgent
- Prioritize after-school hours for student users
- Merge overlapping appointments across locations when practical
- Avoid repeating appointment reasons recently handled—suggest logical next steps instead
- Prefer user’s common booking time (morning/evening)
- Consider environmental and behavioral factors (like traffic, weather, prior habits)
- Maintain conversational memory across sessions to allow natural follow-ups on past conversations

Current Date: ${new Date().toISOString().split('T')[0]}
User Query: ${query}
User Type: ${customerType}
${contextData ? `Context Information:\n${contextData}` : 'No prior context available.'}

Extract or suggest:
- Reason_for_Visit__c (Ask customer if not mentioned, suggest from the previous bookings if available)
- Appointment_Date__c (YYYY-MM-DD)
- Appointment_Time__c (HH:MM AM/PM)
- Location__c (Brooklyn, Manhattan, or New York)
- Banker__c (use the Preferred Banker ID from context if available, otherwise omit it unless specified)

Rules:
- If details are missing, suggest reasonable defaults (e.g., next business day, 9 AM–5 PM, preferred location/banker ID if available), but do not assume a purpose unless the user specifies it.
- Reason_for_Visit__c should be inferred from the user's query and if not provided, ask the user for the reason.
- Your suggestions should be in a suggestive language and not overly explicit; also ask for time, date, or reason if not provided.
- For Banker__c, only include it in appointmentDetails if it's a valid Salesforce ID (e.g., starts with "005" for User records).
- Use prior appointments to infer preferences for Regular customers.
- Respond in natural language under "response" and provide structured data under "appointmentDetails".
- Return JSON like: {"response": "Here's a suggestion...", "appointmentDetails": {...}}
- If the user has already entered all the required details, do not ask for them again.

`;
    // console.log('Generated prompt for OpenAI:', prompt);

    const systemPrompt = { role: 'system', content: prompt };
    const tempMessages = [...req.session.chatHistory, systemPrompt];
    // console.log('Messages sent to OpenAI:', JSON.stringify(tempMessages, null, 2));

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: tempMessages,
      max_tokens: 500,
      temperature: 0.5,
    });
    const llmOutput = openaiResponse.choices[0].message.content.trim();
    console.log('Received response from OpenAI:', llmOutput);

    req.session.chatHistory.push({ role: 'assistant', content: llmOutput });
    console.log('Updated chat history with assistant response:', JSON.stringify(req.session.chatHistory, null, 2));
    
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
      } else {
        console.log('Session saved successfully');
      }
    });

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(llmOutput);
      console.log('Parsed OpenAI response successfully:', parsedResponse);
    } catch (error) {
      console.error('Failed to parse OpenAI response as JSON:', error.message);
      parsedResponse = JSON.parse(extractJSON(llmOutput));
      console.log('Extracted and parsed JSON from OpenAI response:', parsedResponse);
    }

    const { response, appointmentDetails } = parsedResponse;
    let appointmentId = null;

    const requiredFields = ['Reason_for_Visit__c', 'Appointment_Date__c', 'Appointment_Time__c', 'Location__c'];
    const missingFields = requiredFields.filter(field => !appointmentDetails[field]);
    console.log('Initial missing fields:', missingFields);
    
    // If we have missing fields, use the LLM to extract them from the conversation
    if (missingFields.length > 0 && response) {
      console.log('Attempting to extract missing fields using LLM');
      
      // Build a conversation history for context
      const conversationHistory = req.session.chatHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.role === 'assistant' ? JSON.parse(msg.content).response || msg.content : msg.content}`)
        .join('\n');
      
      // Create a prompt specifically for parameter extraction
      const extractionPrompt = `
      You are a parameter extraction assistant. Based on the conversation history below, extract the following appointment details:
      ${missingFields.join(', ')}
      
      Conversation history:
      ${conversationHistory}
      
      Latest response: ${response}
      
      Return ONLY a valid JSON object with the extracted parameters. For example:
      {
        "Reason_for_Visit__c": "Account assistance",
        "Appointment_Date__c": "2025-05-23",
        "Appointment_Time__c": "9:00 AM",
        "Location__c": "Brooklyn"
      }
      
      Only include the parameters that were requested. Format dates as YYYY-MM-DD and times as HH:MM AM/PM.
      `;
      
      try {
        const extractionResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: extractionPrompt }],
          max_tokens: 200,
          temperature: 0.3,
          response_format: { type: "json_object" }
        });
        
        const extractedParams = JSON.parse(extractionResponse.choices[0].message.content.trim());
        console.log('LLM extracted parameters:', extractedParams);
        
        // Merge the extracted parameters with the existing appointmentDetails
        Object.assign(appointmentDetails, extractedParams);
        
        // Update the missing fields list
        const updatedMissingFields = requiredFields.filter(field => !appointmentDetails[field]);
        console.log('Missing fields after LLM extraction:', updatedMissingFields);
      } catch (extractionError) {
        console.error('Error extracting parameters with LLM:', extractionError);
      }
    }

    if (missingFields.length === 0) {
      const dateTime = combineDateTime(appointmentDetails.Appointment_Date__c, appointmentDetails.Appointment_Time__c);
      if (!dateTime) {
        console.error('Invalid dateTime format, cannot create appointment');
        return res.status(400).json({ 
          message: 'Unable to create appointment due to invalid date or time format',
          error: 'INVALID_DATETIME'
        });
      }
    
      const fullAppointmentData = {
        Reason_for_Visit__c: appointmentDetails.Reason_for_Visit__c,
        Appointment_Time__c: dateTime,
        Location__c: appointmentDetails.Location__c,
        Contact__c: '003dM000005H5A7QAK',
        ...(appointmentDetails.Banker__c && appointmentDetails.Banker__c.match(/^005/) && { Banker__c: appointmentDetails.Banker__c }),
      };
    
      // console.log('Creating appointment in Salesforce with data:', JSON.stringify(fullAppointmentData, null, 2));
      const createResult = await conn.sobject('Appointment__c').create(fullAppointmentData);
      if (createResult.success) {
        appointmentId = createResult.id;
        appointmentDetails.Id = appointmentId;
        appointmentDetails.Appointment_Time__c = dateTime;
        // console.log('Appointment created in Salesforce with ID:', appointmentId);
      } else {
        console.error('Failed to create appointment in Salesforce:', createResult);
        throw new Error('Failed to create appointment in Salesforce: ' + JSON.stringify(createResult.errors));
      }
    }

    const responseData = {
      response,
      appointmentDetails,
      missingFields,
      previousAppointments: previousAppointments.length > 0 ? previousAppointments : undefined
    };
    // console.log('Sending response to client:', JSON.stringify(responseData, null, 2));
    res.json(responseData);
  } catch (error) {
    console.error('Error processing chat request:', error.message);
    const isSessionError = error.message && (
      error.message.includes('session') || 
      error.message.includes('Session')
    );
    if (isSessionError) {
      console.log('Session-related error detected');
      return res.status(401).json({ 
        message: 'Session expired or invalid', 
        error: 'SESSION_EXPIRED',
        recovery: true
      });
    }
    res.status(500).json({ 
      message: 'Error processing chat request', 
      error: error.message 
    });
  }
});

app.get('/api/chat/state', optionalAuthenticate, (req, res) => {
  console.log('Fetching current chat state');
  if (!req.session.chatHistory) {
    console.log('No chat history available');
    return res.json({ messages: [], appointmentDetails: null });
  }
  const lastAssistantMessage = req.session.chatHistory.find(msg => msg.role === 'assistant');
  const parsed = lastAssistantMessage ? JSON.parse(lastAssistantMessage.content) : { response: '', appointmentDetails: null };
  const responseData = {
    messages: req.session.chatHistory.filter(msg => msg.role !== 'system'),
    appointmentDetails: parsed.appointmentDetails || null
  };
  // console.log('Sending chat state to client:', JSON.stringify(responseData, null, 2));
  res.json(responseData);
});

app.post('/api/verify-confirmation', async (req, res) => {
  const { text, chatHistory } = req.body;

  console.log('Verifying confirmation:', { text, chatHistory });
  if (!chatHistory || !Array.isArray(chatHistory)) {
    return res.status(400).json({ message: 'Invalid request: chatHistory field is required and must be an array' });
  }

  const userText = text || 'No specific input provided by the user';

  // Get the last 2 or 3 messages from the chatHistory
  const recentChatHistory = chatHistory.slice(-3);

  try {
    const messages = [
      { role: 'system', content: 'Return me true or false if the user has confirmed booking the appointment.' },
      ...recentChatHistory.map(msg => ({ role: msg.type === 'user' ? 'user' : 'assistant', content: msg.text })),
    ];

    // If userText is provided, add it to the messages
    if (text) {
      messages.splice(1, 0, { role: 'user', content: userText });
    }
    console.log('OpenAI request message:', messages);

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 50,
      temperature: 0.5,
    });
    console.log('OpenAI response:', openaiResponse.choices[0].message.content.trim());

    const llmOutput = openaiResponse.choices[0].message.content.trim();
    const isConfirmed = llmOutput.toLowerCase().includes('confirmed') || llmOutput.toLowerCase().includes('true') || llmOutput.toLowerCase().includes('yes') || llmOutput.toLowerCase().includes('successfully scheduled');

    res.json({ isConfirmed });
  } catch (error) {
    console.error('Error verifying confirmation:', error);
    res.status(500).json({ message: 'Error verifying confirmation', error: error.message });
  }
});

app.get('/api/salesforce/banker-notes', authenticate, async (req, res) => {
  console.log('Fetching Salesforce banker notes for Contact__c: 003dM000005H5A7QAK');
  try {
    const conn = getSalesforceConnection();
    const query = "SELECT Visit_Reason__c FROM Branch_Visit__c WHERE Contact__c = '003dM000005H5A7QAK' ORDER BY CreatedDate DESC ";
    console.log('Executing Salesforce query:', query);
    const result = await conn.query(query);
    const bankerNotes = result.records.map(record => record.Banker_Notes__c).filter(Boolean);
    console.log('Salesforce banker notes retrieved:', bankerNotes);
    res.json({ bankerNotes });
  } catch (error) {
    console.error('Error fetching banker notes:', error.message);
    res.status(500).json({ message: 'Failed to fetch banker notes', error: error.message });
  }
});

app.post('/api/salesforce/visit-history', authenticate, async (req, res) => {
  console.log('Fetching Salesforce visit history for Contact__c: 003dM000005H5A7QAK');
  try {
    const conn = getSalesforceConnection();
    const { query } = req.body;
    if (!query) {
      console.log('Missing query in request body');
      return res.status(400).json({ message: 'Missing query in request body' });
    }
    console.log('Executing Salesforce query:', query);
    const result = await conn.query(query);
    console.log('Salesforce visit history retrieved:', JSON.stringify(result.records, null, 2));
    res.json(result);
  } catch (error) {
    console.error('Error fetching visit history:', error.message);
    res.status(500).json({ message: 'Failed to fetch visit history', error: error.message });
  }
});

app.post('/api/chat/recommendations', authenticate, async (req, res) => {
  console.log('Received request for product recommendations:', JSON.stringify(req.body, null, 2));
  try {
    const { visitReasons, customerType, bankerNotes, currentReason } = req.body;
    if (!visitReasons || !Array.isArray(visitReasons)) {
      console.log('Missing or invalid visitReasons in request body');
      return res.status(400).json({ message: 'Missing or invalid visitReasons' });
    }

    // Fetch banker notes if not provided
    let notes = bankerNotes || [];
    if (!notes.length) {
      const conn = getSalesforceConnection();
      const query = "SELECT Visit_Reason__c FROM Branch_Visit__c WHERE Contact__c = '003dM000005H5A7QAK' ORDER BY CreatedDate DESC";
      const result = await conn.query(query);
      notes = result.records.map(record => record.Banker_Notes__c).filter(Boolean);
      console.log('Salesforce banker notes retrieved:', notes);
    }

    // Preprocess visit reasons to remove extra details and focus on key intent
    const simplifiedVisitReasons = visitReasons.map(reason =>
      reason.replace(/:.*$/, '').trim() // Remove everything after ":"
    ).filter(reason => reason.length > 0);

    // Prepare context for LLM
    const contextData = `
Visit Reasons: ${simplifiedVisitReasons.join(', ')}
Banker Notes: ${notes.join('; ') || 'No banker notes available.'}
${currentReason ? `Current Appointment Reason: ${currentReason}` : 'No current appointment reason provided.'}
Available Product Categories: ${Object.keys(productMapping).join(', ')}
`;

    // LLM Prompt with strict JSON enforcement
    const prompt = `
You are a banking assistant tasked with recommending products based on a customer's visit history, banker notes, and current appointment reason. Use the following context to Suggest the next logical appointment purpose, avoiding duplicates from past visits. suggest up to 3 products from the available categories.

${contextData}

Rules:
- Study past visit reasons and banker notes to understand what services the customer has already received.
- Do NOT suggest duplicate product types or appointment purposes already handled.
- Instead, recommend products and appointment purposes that logically follow the previous ones.
- Recommend up to 3 products by selecting the most relevant product categories from: ${Object.keys(
      productMapping
    ).join(", ")}.
- If the user has no current appointment reason, suggest the most likely next step based on their past activity.
- Be proactive. If customer behavior shows gaps (e.g., no digital banking yet), recommend it as a next logical step.
- Suggest a future appointment purpose in "nextAppointmentReason" field.

Return ONLY a valid JSON object in this format:
{
  "recommendations": ["checking_account", "credit_card"],
  "reason": "Customer recently opened a checking account, so a credit card or savings option is the next logical step.",
  "nextAppointmentReason": "Discuss savings account or credit card options"
}
- Do NOT include any text outside the JSON object (e.g., no explanations, comments, or markdown).
`;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Please recommend products based on the provided context.' },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const llmOutput = openaiResponse.choices[0].message.content.trim();
    console.log('Raw LLM response:', llmOutput); // Log raw response for debugging
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(llmOutput);
      if (!parsedResponse.recommendations || !Array.isArray(parsedResponse.recommendations) || !parsedResponse.reason || typeof parsedResponse.reason !== 'string') {
        throw new Error('Invalid JSON structure from LLM');
      }
    } catch (error) {
      console.error('Failed to parse LLM response:', error.message);
      parsedResponse = { recommendations: [], reason: 'Error parsing LLM response.' };
    }

    // Map LLM-recommended categories to actual products
    const recommendedCategories = parsedResponse.recommendations || [];
    const recommendations = [];
    for (const category of recommendedCategories) {
      if (productMapping[category]) {
        recommendations.push(productMapping[category][0]); // Pick the first product from the category
      }
    }

    // Fallback to defaults if no recommendations
    if (!recommendations.length) {
      recommendations.push(...defaultRecommendations.slice(0, 3));
      parsedResponse.reason = parsedResponse.reason || 'No specific recommendations matched; providing default products.';
    }

    res.json({
      recommendations: recommendations.slice(0, 3),
      reason: parsedResponse.reason,
    });
  } catch (error) {
    console.error('Error generating suggested replies:', error);
    res.status(500).json({
      message: 'Failed to generate suggested replies',
      error: error.message,
      suggestions: ["Book an appointment", "Find nearest branch", "I need help"]
    });
  }
});

// New endpoint for generating dynamic quick reply suggestions
app.post('/api/suggestedReplies', async (req, res) => {
  try {
    const { chatHistory, userQuery, userType, sfData } = req.body;
    
    if (!chatHistory || !userQuery) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Format chat history for the LLM
    const formattedChatHistory = chatHistory.map(msg => {
      return `${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.text}`;
    }).join('\n');

    // Format Salesforce data if available
    let sfContext = '';
    if (sfData) {
      if (sfData.appointments && sfData.appointments.length > 0) {
        sfContext += '\nUpcoming Appointments:\n';
        sfData.appointments.forEach(appt => {
          sfContext += `- ${appt.Reason_for_Visit__c || 'General Consultation'} on ${formatDateTimeForDisplay(appt.Appointment_Date__c)} at ${appt.Location__c || 'Main Branch'}\n`;
        });
      }
      
      if (sfData.customerInfo) {
        sfContext += '\nCustomer Information:\n';
        sfContext += `- Type: ${sfData.customerInfo.Customer_Type__c || userType}\n`;
        sfContext += `- Preferred Branch: ${sfData.customerInfo.Preferred_Branch__c || 'Not specified'}\n`;
      }
    }

    // System prompt to guide the LLM's behavior
    const systemPrompt = `
    You are a banking assistant that generates contextually relevant quick reply suggestions for users.
    Based on the conversation history and user's latest query, generate 3 short, helpful suggested replies.
    
    Guidelines for suggested replies:
    1. Keep suggestions brief and actionable (max 5-7 words)
    2. Make them contextually relevant to the conversation
    3. Include options that help the user progress in their banking journey
    4. If the user is asking about appointments, include appointment-related suggestions
    5. If the user is asking about branches, include branch-related suggestions
    6. If the user seems confused, include a "Tell me more" option
    7. If the user is in the middle of a booking flow, include options to continue or restart
    8. NEVER include explanations or any text outside the JSON format
    
    ${sfContext}
    `;

    // Call OpenAI API to generate suggestions
    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Conversation History:\n${formattedChatHistory}\n\nLatest User Query: ${userQuery}\n\nGenerate 3 contextually relevant quick reply suggestions.` }
      ],
      max_tokens: 150,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    // Parse the response
    const responseContent = openaiResponse.choices[0].message.content.trim();
    let suggestions = [];
    
    try {
      const parsedResponse = JSON.parse(responseContent);
      suggestions = parsedResponse.suggestions || [];
      
      // Ensure we have exactly 3 suggestions
      if (suggestions.length > 3) {
        suggestions = suggestions.slice(0, 3);
      } else if (suggestions.length < 3) {
        // Add default suggestions if we don't have enough
        const defaultSuggestions = [
          "Book an appointment",
          "Find nearest branch",
          "Check my appointments"
        ];
        
        while (suggestions.length < 3) {
          const defaultSuggestion = defaultSuggestions[suggestions.length];
          if (!suggestions.includes(defaultSuggestion)) {
            suggestions.push(defaultSuggestion);
          } else {
            suggestions.push("I need help");
          }
        }
      }
    } catch (error) {
      console.error('Error parsing suggestions:', error);
      // Fallback to default suggestions
      suggestions = [
        "Book an appointment",
        "Find nearest branch",
        "Check my appointments"
      ];
    }

    res.json({ suggestions });
  } catch (error) {
    console.error('Error generating suggested replies:', error);
    res.status(500).json({
      message: 'Failed to generate suggested replies',
      error: error.message,
      suggestions: ["Book an appointment", "Find nearest branch", "I need help"]
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});