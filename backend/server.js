import express from 'express';
import jsforce from 'jsforce';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
app.use(express.json());

// Enable CORS with permissive settings for development
const corsOptions = {
  origin: function (origin, callback) {
    console.log('Origin making request:', origin);
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
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

// Product mapping
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

const defaultRecommendations = [
  { name: "Everyday Checking", description: "A versatile checking account for daily transactions.", key: "checking_account" },
  { name: "Way2Save® Savings", description: "Build your savings with automatic transfers.", key: "savings_account" },
  { name: "Digital Banking Tools", description: "Manage your finances with our online and mobile app.", key: "digital_banking" },
];

// Centralized Prompt Templates
const PromptTemplates = {
  persona: `You are a proactive, empathetic banking assistant named "BankBuddy". Your tone is warm, professional, and customer-focused. Always prioritize user privacy, avoiding exposure of sensitive data (e.g., account numbers, passwords).`,
  outputFormat: `Return a JSON object with the specified structure. Do not include explanations, markdown, or text outside the JSON. Ensure all fields are valid and conform to the provided schema.`,
  errorHandling: `If input is ambiguous or missing, use context to infer reasonable defaults or request clarification. If unable to proceed, return an error field with a clear message.`,
  reasoning: `Follow these steps: 1) Analyze the input and context. 2) Identify the user's intent and needs. 3) Generate a response that addresses the intent, using defaults or clarifications as needed. 4) Validate the output against the schema.`,
};

// Utility Functions
const getSalesforceConnection = () => {
  console.log('Establishing Salesforce connection');
  if (!SALESFORCE_ACCESS_TOKEN || !SALESFORCE_INSTANCE_URL) {
    console.error('Missing Salesforce credentials');
    throw new Error('Salesforce credentials not configured');
  }
  const conn = new jsforce.Connection({
    instanceUrl: SALESFORCE_INSTANCE_URL,
    accessToken: SALESFORCE_ACCESS_TOKEN,
  });
  console.log('Salesforce connection established');
  return conn;
};

function formatDateTimeForDisplay(isoDateTime) {
  console.log('Formatting date/time:', isoDateTime);
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
  console.log('Extracting JSON:', str);
  const codeBlockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/;
  const codeBlockMatch = str.match(codeBlockRegex);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      console.log('Parsed JSON from code block:', parsed);
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
        console.log('Parsed JSON from regex:', parsed);
        return match;
      } catch (e) {
        console.error('Error parsing JSON from regex:', e.message);
      }
    }
  }
  console.log('No valid JSON found');
  return '{}';
}

function initGuidedFlowSession(req) {
  if (!req.session.guidedFlow) {
    req.session.guidedFlow = {
      reason: null,
      date: null,
      time: null,
      location: null,
      appointmentId: null // Added to track appointment ID for rescheduling
    };
  }
}

function getMostFrequent(arr) {
  console.log('Finding most frequent:', arr);
  if (!arr.length) return null;
  const counts = arr.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
  const result = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  console.log('Most frequent:', result);
  return result;
}

function convertTo24HourTime(timeStr) {
  console.log('Converting time:', timeStr);
  if (!timeStr) return null;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d{3}Z$/;
  const isoMatch = timeStr.match(isoRegex);
  if (isoMatch) return isoMatch[1];
  const trimmedTimeStr = timeStr.trim();
  const timeRegex = /^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i;
  const match = trimmedTimeStr.match(timeRegex);
  if (!match) {
    console.log('Invalid time format:', trimmedTimeStr);
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
  console.log('Converted time:', result);
  return result;
}

function combineDateTime(dateStr, timeStr) {
  console.log('Combining date/time:', { dateStr, timeStr });
  if (!dateStr || !timeStr) return null;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (isoRegex.test(timeStr)) return timeStr;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    console.log('Invalid date format:', dateStr);
    return null;
  }
  const time24 = convertTo24HourTime(timeStr);
  if (!time24) return null;
  const result = `${dateStr}T${time24}.000Z`;
  console.log('Combined DateTime:', result);
  return result;
}

function parseDateTimeString(dateTimeStr) {
  console.log('Parsing date/time:', dateTimeStr);
  if (!dateTimeStr) return { date: null, time: null };
  const parts = dateTimeStr.match(/(\w+ \d{1,2}, \d{4}), (\d{1,2}:\d{2} [AP]M)/i);
  if (!parts) {
    console.log('Invalid date/time format:', dateTimeStr);
    return { date: null, time: null };
  }
  const [, datePart, timePart] = parts;
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

// Authentication Middleware
const authenticate = (req, res, next) => {
  console.log('Authenticating:', req.session.user);
  if (!req.session.user || req.session.user.username !== STATIC_USERNAME) {
    console.log('Authentication failed');
    return res.status(401).json({ message: 'Unauthorized: Please log in as Jack Rogers' });
  }
  console.log('Authentication successful');
  next();
};

const optionalAuthenticate = (req, res, next) => {
  console.log('Optional authentication:', req.session.user);
  req.user = req.session.user || { username: 'guest' };
  console.log('User set:', req.user);
  next();
};

// API Endpoints
app.post('/api/generate-greeting', optionalAuthenticate, async (req, res) => {
  const customerType = req.user.username !== 'guest' ? 'Valued Customer' : 'Guest';
  const username = req.user.username;
  console.log('Generating greeting:', { customerType, username });

  try {
    const contextData = req.session.chatHistory
      ?.filter(msg => msg.role === 'user' && (msg.content.includes('reason') || msg.content.includes('appointment')))
      .map(msg => msg.content)
      .join('; ') || 'No specific reasons provided.';

    const appointmentContext = req.session.guidedFlow && Object.values(req.session.guidedFlow).some(val => val)
      ? `Unfinished Appointment:\n` +
        `- Reason: ${req.session.guidedFlow.reason || 'Not specified'}\n` +
        `- Date: ${req.session.guidedFlow.date || 'Not specified'}\n` +
        `- Time: ${req.session.guidedFlow.time || 'Not specified'}\n` +
        `- Location: ${req.session.guidedFlow.location || 'Not specified'}`
      : '';

    const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}

Objective: Generate a personalized greeting for a banking customer.

Context:
- Customer Type: ${customerType}
- Username: ${username || 'Guest'}
- Previous Interactions: ${contextData}
- ${appointmentContext || 'No unfinished appointment.'}

Instructions:
1. Welcome the user by name (or "Guest" if none).
2. Acknowledge customer type ("valued customer" or "guest").
3. If an unfinished appointment exists, summarize details and ask if they want to continue.
4. If prior interactions exist, reference past reasons subtly.
5. End with a question (e.g., "How can I assist you today?").
6. Keep the response concise (50-75 tokens), warm, and professional.

Output Schema:
{
  "greeting": "string"
}
`;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }],
      max_tokens: 100,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const { greeting } = JSON.parse(openaiResponse.choices[0].message.content.trim());
    console.log('Generated greeting:', greeting);
    return res.json({ greeting });
  } catch (error) {
    console.error('Error generating greeting:', error);
    const fallbackGreeting = `Welcome${username ? `, ${username}` : ''}! How can I assist you today?`;
    return res.json({ greeting: fallbackGreeting });
  }
});

app.post('/api/auth/login', async (req, res) => {
  console.log('Login request:', req.body);
  const { username, password } = req.body;

  if (!username || !password) {
    console.log('Missing credentials');
    return res.status(400).json({ message: 'Missing username or password' });
  }
  if (username !== STATIC_USERNAME || password !== STATIC_PASSWORD) {
    console.log('Invalid credentials');
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  req.session.user = { username };
  req.session.referralState = 'in_progress';
  req.session.sfChatId = null;
  console.log('User logged in:', req.session.user);

  const contactId = '003dM000005H5A7QAK';
  try {
    const conn = getSalesforceConnection();
    const query = `SELECT Id FROM Chat_Session__c WHERE Contact__c = '${contactId}' AND Appointment_Status__c = 'in_progress'`;
    const result = await conn.query(query);
    if (result.records.length > 0) {
      const updates = result.records.map(record => ({
        Id: record.Id,
        Appointment_Status__c: 'completed',
        Last_Updated__c: new Date().toISOString()
      }));
      await conn.sobject('Chat_Session__c').update(updates);
      console.log('Marked in-progress sessions as completed:', result.records.length);
    }

    const sfChat = await loadChatHistoryFromSalesforce(contactId);
    let greeting;
    let incompleteAppointment = null;
    if (sfChat && sfChat.chatHistory) {
      req.session.chatHistory = sfChat.chatHistory.chatHistory || [];
      req.session.guidedFlow = sfChat.chatHistory.guidedFlow || { reason: null, date: null, time: null, location: null, appointmentId: null };
      req.session.referralState = sfChat.referralState;
      req.session.sfChatId = sfChat.id;
      console.log('Loaded chat session:', sfChat.id);

      const guided = req.session.guidedFlow;
      if (guided && (guided.reason || guided.date || guided.time || guided.location || guided.appointmentId)) {
        incompleteAppointment = guided;
      }

      greeting = await generatePersonalizedGreeting(
        'Regular',
        { chatHistory: req.session.chatHistory, guidedFlow: req.session.guidedFlow },
        username,
        incompleteAppointment
      );
    } else {
      req.session.chatHistory = [];
      req.session.guidedFlow = { reason: null, date: null, time: null, location: null, appointmentId: null };
      req.session.referralState = 'in_progress';
      greeting = await generatePersonalizedGreeting('Regular', null, username, null);
    }

    req.session.chatHistory = [
      { role: 'assistant', content: JSON.stringify({ response: greeting, appointmentDetails: null }) }
    ];

    req.session.sfChatId = await saveChatHistoryToSalesforce({
      contactId,
      chatHistory: {
        guidedFlow: req.session.guidedFlow,
        chatHistory: req.session.chatHistory
      },
      referralState: 'in_progress'
    });
    console.log('Created chat session:', req.session.sfChatId);

    res.json({
      message: 'Login successful',
      username,
      greeting,
      chatHistory: req.session.chatHistory,
      guidedFlow: req.session.guidedFlow
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.get('/api/session-health', (req, res) => {
  console.log('Checking session health');
  if (req.session && req.session.id) {
    console.log('Session healthy:', req.session.id);
    res.status(200).json({ status: 'healthy' });
  } else {
    console.log('Session unhealthy');
    res.status(401).json({ status: 'unhealthy', error: 'SESSION_EXPIRED' });
  }
});

app.get('/api/auth/check-session', (req, res) => {
  console.log('Checking session');
  if (req.session.user && req.session.user.username === STATIC_USERNAME) {
    console.log('Session active:', req.session.user.username);
    res.json({ username: req.session.user.username });
  } else {
    console.log('No active session');
    res.status(401).json({ message: 'Not logged in' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  console.log('Logout request');
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ message: 'Failed to log out' });
    }
    console.log('Session destroyed');
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/salesforce/appointments', authenticate, async (req, res) => {
  console.log('Fetching appointments for Contact__c: 003dM000005H5A7QAK');
  try {
    const conn = getSalesforceConnection();
    const query = 'SELECT Id, Reason_for_Visit__c, Appointment_Date__c, Appointment_Time__c, Location__c, Status__c FROM Appointment__c WHERE Contact__c = \'003dM000005H5A7QAK\'';
    const result = await conn.query(query);
    console.log('Retrieved appointments:', result.records);
    res.json(result.records);
  } catch (error) {
    console.error('Error fetching appointments:', error.message);
    res.status(500).json({ message: 'Failed to fetch appointments', error: error.message });
  }
});

app.post('/api/salesforce/appointments', authenticate, async (req, res) => {
  console.log('Creating appointment:', req.body);
  try {
    const conn = getSalesforceConnection();
    const appointmentData = {
      ...req.body,
      Contact__c: '003dM000005H5A7QAK',
      Status__c: 'Confirmed' // Set default status to Confirmed
    };
    const result = await conn.sobject('Appointment__c').create(appointmentData);
    if (result.success) {
      console.log('Appointment created:', result.id);
      
      if (req.session.sfChatId) {
        await conn.sobject('Chat_Session__c').update({
          Id: req.session.sfChatId,
          Appointment_Status__c: 'completed',
          Last_Updated__c: new Date().toISOString()
        });
        console.log('Chat session completed:', req.session.sfChatId);
        req.session.referralState = 'completed';
      }

      req.session.chatHistory = [];
      req.session.guidedFlow = { reason: null, date: null, time: null, location: null, appointmentId: null };
      req.session.sfChatId = null;

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

// New endpoint for rescheduling or cancelling appointments
app.post('/api/salesforce/appointments/reschedule', authenticate, async (req, res) => {
  console.log('Reschedule/cancel request:', req.body);
  const { appointmentId, action, appointmentDetails } = req.body;

  if (!appointmentId || !action) {
    console.log('Missing appointmentId or action');
    return res.status(400).json({ message: 'Missing appointmentId or action' });
  }

  if (!['reschedule', 'cancel'].includes(action)) {
    console.log('Invalid action');
    return res.status(400).json({ message: 'Invalid action: must be "reschedule" or "cancel"' });
  }

  try {
    const conn = getSalesforceConnection();
    const contactId = '003dM000005H5A7QAK';

    // Verify appointment exists and belongs to the contact
    const query = `SELECT Id, Reason_for_Visit__c, Appointment_Date__c, Appointment_Time__c, Location__c, Status__c 
                  FROM Appointment__c 
                  WHERE Id = '${appointmentId}' AND Contact__c = '${contactId}'`;
    const result = await conn.query(query);
    
    if (result.records.length === 0) {
      console.log('Appointment not found');
      return res.status(404).json({ message: 'Appointment not found or does not belong to this contact' });
    }

    const existingAppointment = result.records[0];
    if (existingAppointment.Status__c === 'Cancelled') {
      console.log('Appointment already cancelled');
      return res.status(400).json({ message: 'Cannot modify a cancelled appointment' });
    }

    if (action === 'cancel') {
      // Update status to Cancelled
      const updateResult = await conn.sobject('Appointment__c').update({
        Id: appointmentId,
        Status__c: 'Cancelled',
        LastModifiedDate: new Date().toISOString()
      });

      if (updateResult.success) {
        console.log('Appointment cancelled:', appointmentId);
        req.session.chatHistory.push({
          role: 'user',
          content: 'Cancel appointment'
        });
        req.session.chatHistory.push({
          role: 'assistant',
          content: JSON.stringify({
            response: `Your appointment has been cancelled. How else can I assist you?`,
            appointmentDetails: { Id: appointmentId, Status__c: 'Cancelled' },
            missingFields: []
          })
        });

        // Save chat history
        req.session.sfChatId = await saveChatHistoryToSalesforce({
          contactId,
          chatHistory: {
            guidedFlow: req.session.guidedFlow || { reason: null, date: null, time: null, location: null, appointmentId: null },
            chatHistory: req.session.chatHistory
          },
          referralState: req.session.referralState || 'in_progress'
        });

        req.session.save(err => {
          if (err) console.error('Error saving session:', err);
          else console.log('Session saved');
        });

        return res.json({
          message: 'Appointment cancelled',
          appointmentDetails: { Id: appointmentId, Status__c: 'Cancelled' }
        });
      } else {
        console.error('Failed to cancel appointment:', updateResult);
        return res.status(500).json({ message: 'Failed to cancel appointment' });
      }
    }

    // Handle reschedule
    if (!appointmentDetails || Object.keys(appointmentDetails).length === 0) {
      console.log('Missing appointment details for reschedule');
      return res.status(400).json({ message: 'Missing appointment details for rescheduling' });
    }

    const requiredFields = ['Reason_for_Visit__c', 'Appointment_Date__c', 'Appointment_Time__c', 'Location__c'];
    const validatedMissingFields = requiredFields.filter(field => {
      const value = appointmentDetails[field];
      return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
    });

    if (validatedMissingFields.length > 0) {
      const fieldPrompts = {
        Reason_for_Visit__c: "What's the reason for your visit?",
        Appointment_Date__c: "When would you like to reschedule your appointment?",
        Appointment_Time__c: "What time works best for you?",
        Location__c: "Which branch would you prefer to visit?"
      };

      const naturalPrompts = validatedMissingFields.map(field => fieldPrompts[field]);
      const response = `I’d be happy to reschedule your appointment! ${naturalPrompts.slice(0, -1).join(', ')}${naturalPrompts.length > 1 ? ' and ' : ''}${naturalPrompts.slice(-1)}.`;

      return res.json({
        response,
        appointmentDetails,
        missingFields: validatedMissingFields
      });
    }

    // Validate and combine date and time
    const dateTime = combineDateTime(appointmentDetails.Appointment_Date__c, appointmentDetails.Appointment_Time__c);
    if (!dateTime) {
      console.error('Invalid dateTime format');
      return res.status(400).json({ message: 'Invalid date or time format', error: 'INVALID_DATETIME' });
    }

    // Prepare update data
    const updateData = {
      Id: appointmentId,
      Reason_for_Visit__c: appointmentDetails.Reason_for_Visit__c,
      Appointment_Time__c: dateTime,
      Location__c: appointmentDetails.Location__c,
      Status__c: 'Confirmed',
      LastModifiedDate: new Date().toISOString(),
      ...(appointmentDetails.Banker__c && appointmentDetails.Banker__c.match(/^005/) && { Banker__c: appointmentDetails.Banker__c })
    };

    // Update appointment
    const updateResult = await conn.sobject('Appointment__c').update(updateData);
    if (updateResult.success) {
      console.log('Appointment rescheduled:', appointmentId);

      // Update session
      req.session.guidedFlow = {
        reason: appointmentDetails.Reason_for_Visit__c,
        date: appointmentDetails.Appointment_Date__c,
        time: appointmentDetails.Appointment_Time__c,
        location: appointmentDetails.Location__c,
        appointmentId
      };

      // Generate LLM response
      const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}

Objective: Confirm rescheduling of an appointment.

Context:
- Appointment ID: ${appointmentId}
- Reason: ${appointmentDetails.Reason_for_Visit__c}
- Date: ${appointmentDetails.Appointment_Date__c}
- Time: ${appointmentDetails.Appointment_Time__c}
- Location: ${appointmentDetails.Location__c}
- Username: ${req.user.username || 'Guest'}

Instructions:
1. Confirm the appointment has been rescheduled.
2. Summarize the updated details.
3. Remind user to bring ID, address proof, and statements.
4. Keep response concise (50-75 tokens), warm, and professional.

Output Schema:
{
  "response": "string",
  "appointmentDetails": {
    "Id": "string",
    "Reason_for_Visit__c": "string",
    "Appointment_Date__c": "string",
    "Appointment_Time__c": "string",
    "Location__c": "string",
    "Status__c": "string"
  },
  "missingFields": []
}
`;

      const openaiResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const llmOutput = JSON.parse(openaiResponse.choices[0].message.content.trim());
      console.log('LLM reschedule confirmation:', llmOutput);

      // Update chat history
      req.session.chatHistory.push({
        role: 'user',
        content: `Reschedule appointment ${appointmentId}`
      });
      req.session.chatHistory.push({
        role: 'assistant',
        content: JSON.stringify(llmOutput)
      });

      // Save chat history
      req.session.sfChatId = await saveChatHistoryToSalesforce({
        contactId,
        chatHistory: {
          guidedFlow: req.session.guidedFlow,
          chatHistory: req.session.chatHistory
        },
        referralState: req.session.referralState || 'in_progress'
      });

      req.session.save(err => {
        if (err) console.error('Error saving session:', err);
        else console.log('Session saved');
      });

      return res.json({
        message: 'Appointment rescheduled',
        ...llmOutput
      });
    } else {
      console.error('Failed to reschedule appointment:', updateResult);
      return res.status(500).json({ message: 'Failed to reschedule appointment' });
    }
  } catch (error) {
    console.error('Error processing reschedule/cancel:', error.message);
    return res.status(500).json({ message: 'Error processing request', error: error.message });
  }
});

app.post('/api/chat', optionalAuthenticate, async (req, res) => {
  console.log('Chat request:', req.body);
  try {
    const { query, customerType } = req.body;
    if (!query || !customerType) {
      console.log('Missing query or customerType');
      return res.status(400).json({ message: 'Missing query or customerType' });
    }

    if (!req.session) {
      console.error('No session');
      return res.status(401).json({ message: 'Session expired', error: 'SESSION_EXPIRED', recovery: true });
    }

    const contactId = '003dM000005H5A7QAK';
    const username = req.user.username;
    const isRegularCustomer = customerType === 'Regular' || customerType === 'customer';

    if (!req.session.chatHistory) {
      const sfChat = await loadChatHistoryFromSalesforce(contactId);
      let greeting;
      if (sfChat && sfChat.chatHistory && sfChat.chatHistory.length > 0) {
        req.session.chatHistory = sfChat.chatHistory;
        req.session.referralState = sfChat.referralState;
        req.session.sfChatId = sfChat.id;
        console.log('Loaded chat history');
        greeting = await generatePersonalizedGreeting(customerType, sfChat.chatHistory, username);
      } else {
        req.session.chatHistory = [];
        req.session.referralState = 'in_progress';
        greeting = await generatePersonalizedGreeting(customerType, null, username);
      }

      req.session.chatHistory = [
        { role: 'assistant', content: JSON.stringify({ response: greeting, appointmentDetails: null }) }
      ];

      req.session.sfChatId = await saveChatHistoryToSalesforce({
        contactId,
        chatHistory: {
          guidedFlow: req.session.guidedFlow || { reason: null, date: null, time: null, location: null, appointmentId: null },
          chatHistory: req.session.chatHistory
        },
        referralState: 'in_progress'
      });
      console.log('Created chat session:', req.session.sfChatId);
    }

    const branchQuery = "Find me a branch within 5 miles with 24hrs Drive-thru ATM service";
    if (query.toLowerCase().includes(branchQuery.toLowerCase())) {
      console.log('Detected branch query');
      const predefinedResponse = {
        response: "I found a branch at 123 Main St, Brooklyn, NY 11201. Navigate: https://goo.gl/maps/12345",
        appointmentDetails: null,
        missingFields: []
      };
      req.session.chatHistory.push({ role: 'user', content: query });
      req.session.chatHistory.push({ role: 'assistant', content: JSON.stringify(predefinedResponse) });

      try {
        req.session.sfChatId = await saveChatHistoryToSalesforce({
          contactId,
          chatHistory: {
            guidedFlow: req.session.guidedFlow || { reason: null, date: null, time: null, location: null, appointmentId: null },
            chatHistory: req.session.chatHistory
          },
          referralState: 'in_progress'
        });
        console.log('Chat history saved:', req.session.sfChatId);
      } catch (error) {
        console.error('Error saving chat history:', error);
      }

      req.session.save(err => {
        if (err) console.error('Error saving session:', err);
        else console.log('Session saved');
      });
      return res.json(predefinedResponse);
    }

    let conn;
    try {
      conn = getSalesforceConnection();
    } catch (error) {
      console.error('Salesforce connection error:', error.message);
      return res.status(500).json({ message: 'Salesforce connection failed' });
    }

    let contextData = '';
    let previousAppointments = [];
    if (isRegularCustomer) {
      const query = 'SELECT Id, Reason_for_Visit__c, Appointment_Date__c, Appointment_Time__c, Location__c, Banker__c, CreatedDate, Status__c ' +
                    'FROM Appointment__c WHERE Contact__c = \'003dM000005H5A7QAK\' ORDER BY CreatedDate DESC';
      const result = await conn.query(query);
      previousAppointments = result.records;
      console.log('Retrieved appointments:', previousAppointments);

      if (previousAppointments.length > 0) {
        contextData = previousAppointments.map((r, i) => {
          return `Appointment ${i + 1}:
Reason: ${r.Reason_for_Visit__c || 'Not specified'}
Date: ${r.Appointment_Date__c || 'Not specified'}
Time: ${r.Appointment_Time__c || 'Not specified'}
Location: ${r.Location__c || 'Not specified'}
Banker ID: ${r.Banker__c || 'Not specified'}
Status: ${r.Status__c || 'Not specified'}`;
        }).join('\n\n');

        const bankers = previousAppointments.map(r => r.Banker__c).filter(Boolean);
        if (bankers.length > 0) {
          contextData += `\nPreferred Banker ID: a0AdM000002ZcsUUAS\nPreferred Banker Name: George`;
        }

        const locations = previousAppointments.map(r => r.Location__c).filter(Boolean);
        if (locations.length > 0) {
          contextData += `\nPreferred Location: Brooklyn`;
        }
        console.log('Context data:', contextData);
      }
    }

    req.session.chatHistory.push({ role: 'user', content: query });

    const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}
${PromptTemplates.errorHandling}

Objective: Assist with banking appointment scheduling, rescheduling, or cancellation based on user query and context.

Context:
- Current Date: ${new Date().toISOString().split('T')[0]}
- User Query: ${query}
- User Type: ${customerType}
- Username: ${username || 'Guest'}
- ${contextData ? `Previous Appointments:\n${contextData}` : 'No prior appointments.'}

Instructions:
1. Identify the user's intent (e.g., book, reschedule, cancel appointment, get branch info).
2. For rescheduling:
   - Identify the appointment to reschedule (use most recent non-cancelled appointment if not specified).
   - Extract or suggest new appointment details:
     - Reason_for_Visit__c: REQUIRED. Must be non-empty; use existing reason if not provided.
     - Appointment_Date__c: REQUIRED. Suggest next business day (YYYY-MM-DD) if not specified.
     - Appointment_Time__c: REQUIRED. Suggest 9:00 AM–5:00 PM (HH:MM AM/PM) if not specified.
     - Location__c: REQUIRED. Use Brooklyn, Manhattan, or New York; prefer existing location.
     - Status__c: Set to 'Confirmed'.
     - Banker__c: Optional. Include only if valid Salesforce ID (starts with "005") from context.
   - Include appointmentId if identified.
3. For cancellation:
   - Identify the appointment to cancel (use most recent non-cancelled appointment if not specified).
   - Set Status__c to 'Cancelled'.
   - Include appointmentId if identified.
4. For booking new appointments:
   - Extract or suggest appointment details as above, but do not include appointmentId.
5. Validate that Reason_for_Visit__c is non-empty. If empty, include in missingFields with message: "Please specify the reason for your visit."
6. If any required fields are missing or invalid, list them in missingFields and craft a natural, empathetic response:
   - For Reason_for_Visit__c: "What's the reason for your visit?"
   - For Appointment_Date__c: "When would you like to schedule your appointment?"
   - For Appointment_Time__c: "What time works best for you?"
   - For Location__c: "Which branch would you prefer to visit?"
   - Combine prompts if multiple fields are missing.
7. Acknowledge existing details to personalize the response.
8. If all required fields are present and valid for rescheduling or booking, confirm with user and include a reminder to bring ID, address proof, and statements.
9. For cancellation, confirm cancellation and ask how else to assist.
10. For urgent queries (e.g., "lost card"), prioritize earlier slots.
11. For students, prefer 3:00 PM–5:00 PM.
12. Keep response concise (1–2 sentences, 50–75 tokens), natural, and empathetic.

Output Schema:
{
  "response": "string",
  "appointmentDetails": {
    "Id": "string|null",
    "Reason_for_Visit__c": "string|null",
    "Appointment_Date__c": "string|null",
    "Appointment_Time__c": "string|null",
    "Location__c": "string|null",
    "Banker__c": "string|null",
    "Status__c": "string|null"
  },
  "missingFields": ["string"],
  "action": "book|reschedule|cancel|null",
  "error": "string|null"
}
`;

    const systemPrompt = { role: 'system', content: prompt };
    const tempMessages = [...req.session.chatHistory, systemPrompt];

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: tempMessages,
      max_tokens: 500,
      temperature: 0.5,
      response_format: { type: "json_object" }
    });
    const llmOutput = openaiResponse.choices[0].message.content.trim();
    console.log('OpenAI response:', llmOutput);

    req.session.chatHistory.push({ role: 'assistant', content: llmOutput });

    try {
      req.session.sfChatId = await saveChatHistoryToSalesforce({
        contactId,
        chatHistory: {
          guidedFlow: req.session.guidedFlow || { reason: null, date: null, time: null, location: null, appointmentId: null },
          chatHistory: req.session.chatHistory
        },
        referralState: 'in_progress'
      });
      console.log('Chat history saved:', req.session.sfChatId);
    } catch (error) {
      console.error('Error saving chat history:', error);
    }

    req.session.save(err => {
      if (err) console.error('Error saving session:', err);
      else console.log('Session saved');
    });

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(llmOutput);
      console.log('Parsed response:', parsedResponse);
    } catch (error) {
      console.error('Failed to parse response:', error.message);
      parsedResponse = JSON.parse(extractJSON(llmOutput));
      console.log('Extracted JSON:', parsedResponse);
    }

    let { response, appointmentDetails, missingFields, action, error } = parsedResponse;

    if (error) {
      console.error('LLM returned error:', error);
      return res.status(400).json({ message: error });
    }

    let appointmentId = appointmentDetails.Id;
    const requiredFields = ['Reason_for_Visit__c', 'Appointment_Date__c', 'Appointment_Time__c', 'Location__c'];

    // Explicitly validate required fields
    const validatedMissingFields = requiredFields.filter(field => {
      const value = appointmentDetails[field];
      return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
    });

    // Map technical field names to natural language prompts
    const fieldPrompts = {
      Reason_for_Visit__c: "What's the reason for your visit?",
      Appointment_Date__c: action === 'reschedule' ? "When would you like to reschedule your appointment?" : "When would you like to schedule your appointment?",
      Appointment_Time__c: "What time works best for you?",
      Location__c: "Which branch would you prefer to visit?"
    };

    if (validatedMissingFields.length > 0) {
      console.log('Validated missing fields:', validatedMissingFields);

      // Craft a natural response if the LLM didn't provide one
      if (!response || response.includes('Please provide the missing details')) {
        let naturalPrompts = validatedMissingFields.map(field => fieldPrompts[field]);
        
        // Personalize based on existing details
        let contextPrefix = `Hey ${username || 'there'}, I’d be happy to ${action === 'reschedule' ? 'reschedule' : 'book'} your appointment`;
        if (appointmentDetails.Appointment_Date__c) {
          contextPrefix += ` for ${new Date(appointmentDetails.Appointment_Date__c).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
        }
        if (appointmentDetails.Location__c) {
          contextPrefix += ` at our ${appointmentDetails.Location__c} branch`;
        }
        contextPrefix += '!';

        if (naturalPrompts.length === 1) {
          response = `${contextPrefix} ${naturalPrompts[0]}`;
        } else {
          response = `${contextPrefix} ${naturalPrompts.slice(0, -1).join(', ')} and ${naturalPrompts.slice(-1)}.`;
        }
      }

      return res.json({
        response,
        appointmentDetails,
        missingFields: validatedMissingFields,
        action,
        previousAppointments: previousAppointments.length > 0 ? previousAppointments : undefined
      });
    }

    if (missingFields.length === 0 && validatedMissingFields.length === 0) {
      const isConfirmed = await verifyConfirmation(query, req.session.chatHistory);
      if (!isConfirmed) {
        console.log('Appointment not confirmed');
        return res.json({
          response: response + ` Please confirm these details to ${action === 'reschedule' ? 'reschedule' : 'book'} your appointment.`,
          appointmentDetails,
          missingFields: [],
          action,
          previousAppointments: previousAppointments.length > 0 ? previousAppointments : undefined
        });
      }

      const dateTime = combineDateTime(appointmentDetails.Appointment_Date__c, appointmentDetails.Appointment_Time__c);
      if (!dateTime) {
        console.error('Invalid dateTime format');
        return res.status(400).json({ 
          message: 'Invalid date or time format',
          error: 'INVALID_DATETIME'
        });
      }

      const fullAppointmentData = {
        Reason_for_Visit__c: appointmentDetails.Reason_for_Visit__c,
        Appointment_Time__c: dateTime,
        Location__c: appointmentDetails.Location__c,
        Contact__c: '003dM000005H5A7QAK',
        Status__c: 'Confirmed',
        ...(appointmentDetails.Banker__c && appointmentDetails.Banker__c.match(/^005/) && { Banker__c: appointmentDetails.Banker__c })
      };

      let result;
      if (action === 'reschedule' && appointmentId) {
        // Update existing appointment
        fullAppointmentData.Id = appointmentId;
        fullAppointmentData.LastModifiedDate = new Date().toISOString();
        result = await conn.sobject('Appointment__c').update(fullAppointmentData);
        if (!result.success) {
          console.error('Failed to reschedule appointment:', result);
          throw new Error('Failed to reschedule appointment: ' + JSON.stringify(result.errors));
        }
        console.log('Appointment rescheduled:', appointmentId);
      } else if (action === 'cancel' && appointmentId) {
        // Cancel appointment
        result = await conn.sobject('Appointment__c').update({
          Id: appointmentId,
          Status__c: 'Cancelled',
          LastModifiedDate: new Date().toISOString()
        });
        if (!result.success) {
          console.error('Failed to cancel appointment:', result);
          throw new Error('Failed to cancel appointment: ' + JSON.stringify(result.errors));
        }
        console.log('Appointment cancelled:', appointmentId);
        response = `Your appointment has been cancelled. How else can I assist you?`;
        appointmentDetails.Status__c = 'Cancelled';
      } else {
        // Create new appointment
        result = await conn.sobject('Appointment__c').create(fullAppointmentData);
        if (!result.success) {
          console.error('Failed to create appointment:', result);
          throw new Error('Failed to create appointment: ' + JSON.stringify(result.errors));
        }
        appointmentId = result.id;
        console.log('Appointment created:', appointmentId);
      }

      if (result.success) {
        appointmentDetails.Id = appointmentId;
        appointmentDetails.Appointment_Time__c = dateTime;
        appointmentDetails.Status__c = action === 'cancel' ? 'Cancelled' : 'Confirmed';

        if (req.session.sfChatId) {
          await conn.sobject('Chat_Session__c').update({
            Id: req.session.sfChatId,
            Appointment_Status__c: action === 'cancel' ? 'completed' : 'in_progress',
            Last_Updated__c: new Date().toISOString()
          });
          console.log('Chat session updated:', req.session.sfChatId);
          req.session.referralState = action === 'cancel' ? 'completed' : 'in_progress';
        }

        if (action !== 'cancel') {
          req.session.guidedFlow = {
            reason: appointmentDetails.Reason_for_Visit__c,
            date: appointmentDetails.Appointment_Date__c,
            time: appointmentDetails.Appointment_Time__c,
            location: appointmentDetails.Location__c,
            appointmentId
          };
        } else {
          req.session.guidedFlow = { reason: null, date: null, time: null, location: null, appointmentId: null };
        }
      }

      res.json({
        response,
        appointmentDetails,
        missingFields: validatedMissingFields,
        action,
        previousAppointments: previousAppointments.length > 0 ? previousAppointments : undefined
      });
    } else {
      res.json({
        response,
        appointmentDetails,
        missingFields: validatedMissingFields,
        action,
        previousAppointments: previousAppointments.length > 0 ? previousAppointments : undefined
      });
    }
  } catch (error) {
    console.error('Error processing chat:', error.message);
    const isSessionError = error.message && (
      error.message.includes('session') || 
      error.message.includes('Session')
    );
    if (isSessionError) {
      return res.status(401).json({ 
        message: 'Session expired', 
        error: 'SESSION_EXPIRED',
        recovery: true
      });
    }
    res.status(500).json({ 
      message: 'Error processing chat', 
      error: error.message 
    });
  }
});

app.get('/api/chat/state', optionalAuthenticate, (req, res) => {
  console.log('Fetching chat state');
  if (!req.session.chatHistory) {
    console.log('No chat history');
    return res.json({ messages: [], appointmentDetails: null });
  }
  const lastAssistantMessage = req.session.chatHistory.find(msg => msg.role === 'assistant');
  const parsed = lastAssistantMessage ? JSON.parse(lastAssistantMessage.content) : { response: '', appointmentDetails: null };
  res.json({
    messages: req.session.chatHistory.filter(msg => msg.role !== 'system'),
    appointmentDetails: parsed.appointmentDetails || null
  });
});

app.post('/api/verify-confirmation', async (req, res) => {
  const { text, chatHistory } = req.body;
  console.log('Verifying confirmation:', { text });

  if (!chatHistory || !Array.isArray(chatHistory)) {
    return res.status(400).json({ message: 'Invalid request: chatHistory required' });
  }

  const userText = text || 'No specific input provided';

  try {
    const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}

Objective: Determine if the user has confirmed an appointment.

Context:
- User Input: ${userText}
- Recent Chat History: ${JSON.stringify(chatHistory.slice(-3))}

Instructions:
1. Analyze the user input and recent chat history.
2. Check for explicit confirmation (e.g., "confirm", "yes", "book it").
3. Return true if confirmed, false otherwise.

Output Schema:
{
  "isConfirmed": boolean
}
`;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        ...chatHistory.slice(-3).map(msg => ({ role: msg.type === 'user' ? 'user' : 'assistant', content: msg.text })),
        { role: 'user', content: userText }
      ],
      max_tokens: 50,
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const { isConfirmed } = JSON.parse(openaiResponse.choices[0].message.content.trim());
    console.log('Confirmation result:', isConfirmed);
    res.json({ isConfirmed });
  } catch (error) {
    console.error('Error verifying confirmation:', error);
    res.status(500).json({ message: 'Error verifying confirmation', error: error.message });
  }
});

app.get('/api/salesforce/banker-notes', authenticate, async (req, res) => {
  console.log('Fetching banker notes for Contact__c: 003dM000005H5A7QAK');
  try {
    const conn = getSalesforceConnection();
    const query = "SELECT Visit_Reason__c FROM Branch_Visit__c WHERE Contact__c = '003dM000005H5A7QAK' ORDER BY CreatedDate DESC ";
    const result = await conn.query(query);
    const bankerNotes = result.records.map(record => record.Banker_Notes__c).filter(Boolean);
    console.log('Retrieved banker notes:', bankerNotes);
    res.json({ bankerNotes });
  } catch (error) {
    console.error('Error fetching banker notes:', error);
    res.status(500).json({ message: 'Failed to fetch banker notes', error: error.message });
  }
});

app.post('/api/salesforce/visit-history', authenticate, async (req, res) => {
  console.log('Fetching visit history for Contact__c: 003dM000005H5A7QAK');
  try {
    const conn = getSalesforceConnection();
    const { query } = req.body;
    if (!query) {
      console.log('Missing query');
      return res.status(400).json({ message: 'Missing query' });
    }
    const result = await conn.query(query);
    console.log('Retrieved visit history:', result.records);
    res.json(result);
  } catch (error) {
    console.error('Error fetching visit history:', error);
    res.status(500).json({ message: 'Failed to fetch visit history', error: error.message });
  }
});

app.post('/api/chat/recommendations', authenticate, async (req, res) => {
  console.log('Product recommendations request:', req.body);
  try {
    const { visitReasons, customerType, bankerNotes, currentReason } = req.body;
    if (!visitReasons || !Array.isArray(visitReasons)) {
      console.log('Invalid visitReasons');
      return res.status(400).json({ message: 'Invalid visitReasons' });
    }

    let notes = bankerNotes || [];
    if (!notes.length) {
      const conn = getSalesforceConnection();
      const query = "SELECT Visit_Reason__c FROM Branch_Visit__c WHERE Contact__c = '003dM000005H5A7QAK' ORDER BY CreatedDate DESC";
      const result = await conn.query(query);
      notes = result.records.map(record => record.Banker_Notes__c).filter(Boolean);
      console.log('Retrieved banker notes:', notes);
    }

    const simplifiedVisitReasons = visitReasons.map(reason =>
      reason.replace(/:.*$/, '').trim()
    ).filter(reason => reason.length > 0);

    const contextData = `
Visit Reasons: ${simplifiedVisitReasons.join(', ')}
Banker Notes: ${notes.join('; ') || 'No notes available.'}
Current Reason: ${currentReason || 'Not provided.'}
Available Products: ${Object.keys(productMapping).join(', ')}
`;

    const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}
${PromptTemplates.errorHandling}

Objective: Recommend up to 3 banking products based on customer history and context.

Context:
${contextData}

Instructions:
1. Analyze visit reasons, banker notes, and current reason to identify needs.
2. Select up to 3 product categories from: ${Object.keys(productMapping).join(', ')}.
3. Provide a concise reason (20–30 words) for the recommendations.
4. If no relevant products match, use default categories (checking_account, savings_account, digital_banking).

Output Schema:
{
  "recommendations": ["string"],
  "reason": "string",
  "error": "string|null"
}
`;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Recommend products based on context.' }
      ],
      max_tokens: 300,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const llmOutput = openaiResponse.choices[0].message.content.trim();
    console.log('LLM response:', llmOutput);
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(llmOutput);
      if (!parsedResponse.recommendations || !Array.isArray(parsedResponse.recommendations) || !parsedResponse.reason) {
        throw new Error('Invalid JSON structure');
      }
    } catch (error) {
      console.error('Failed to parse LLM response:', error.message);
      parsedResponse = { recommendations: [], reason: 'Error parsing response.', error: error.message };
    }

    const recommendedCategories = parsedResponse.recommendations || [];
    const recommendations = recommendedCategories
      .filter(category => productMapping[category])
      .map(category => productMapping[category][0]);

    if (!recommendations.length) {
      recommendations.push(...defaultRecommendations.slice(0, 3));
      parsedResponse.reason = parsedResponse.reason || 'No specific recommendations; providing defaults.';
    }

    res.json({
      recommendations: recommendations.slice(0, 3),
      reason: parsedResponse.reason,
      error: parsedResponse.error
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      message: 'Failed to generate recommendations',
      error: error.message,
      recommendations: defaultRecommendations.slice(0, 3)
    });
  }
});

app.post('/api/suggestedReplies', async (req, res) => {
  try {
    const { chatHistory, userQuery, userType, sfData, missingFields, guidedFlow } = req.body;

    if (!chatHistory || !userQuery) {
      return res.status(400).json({ message: 'Missing chatHistory or userQuery' });
    }

    // Fetch customer data for personalization
    let previousAppointments = [];
    let bankerNotes = [];
    if (userType === 'Regular' && sfData?.customerInfo?.Contact__c) {
      const conn = getSalesforceConnection();
      const query = `SELECT Id, Reason_for_Visit__c, Appointment_Date__c, Appointment_Time__c, Location__c
                    FROM Appointment__c WHERE Contact__c = '${sfData.customerInfo.Contact__c}' ORDER BY CreatedDate DESC LIMIT 5`;
      const result = await conn.query(query);
      previousAppointments = result.records;

      const notesQuery = `SELECT Visit_Reason__c FROM Branch_Visit__c WHERE Contact__c = '${sfData.customerInfo.Contact__c}' ORDER BY CreatedDate DESC`;
      const notesResult = await conn.query(notesQuery);
      bankerNotes = notesResult.records.map(record => record.Visit_Reason__c).filter(Boolean);
    }

    // Format chat history
    const formattedChatHistory = chatHistory.map(msg => {
      return `${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.text}`;
    }).join('\n');

    // Salesforce context
    let sfContext = '';
    if (sfData?.appointments?.length > 0) {
      sfContext += 'Upcoming Appointments:\n' + sfData.appointments.map(appt => {
        return `- ${appt.Reason_for_Visit__c || 'General Consultation'} on ${formatDateTimeForDisplay(appt.Appointment_Date__c)} at ${appt.Location__c || 'Main Branch'}`;
      }).join('\n');
    }
    if (sfData?.customerInfo) {
      sfContext += `\nCustomer Info:\n- Type: ${sfData.customerInfo.Customer_Type__c || userType}\n- Preferred Branch: ${sfData.customerInfo.Preferred_Branch__c || 'Not specified'}`;
    }

    // Common reasons for appointment
    const commonReasons = [
      'Open a new account',
      'Loan consultation',
      'Credit card application',
      'Manage spending and saving',
      'Build credit and reduce debt',
      'Questions about MYBANK products',
      'Save for retirement'
    ];

    // Prioritize reasons based on customer data
    const prioritizedReasons = [...commonReasons];
    if (previousAppointments.length > 0) {
      const pastReasons = previousAppointments.map(appt => appt.Reason_for_Visit__c).filter(Boolean);
      const frequentReason = getMostFrequent(pastReasons);
      if (frequentReason && prioritizedReasons.includes(frequentReason)) {
        prioritizedReasons.splice(prioritizedReasons.indexOf(frequentReason), 1);
        prioritizedReasons.unshift(frequentReason); // Move frequent reason to top
      }
    }

    // Determine suggestions based on missingFields and guidedFlow
    let suggestions = [];
    if (missingFields?.includes('Reason_for_Visit__c') || guidedFlow?.reason === null) {
      // Suggest reasons
      suggestions = prioritizedReasons.slice(0, 3).map(reason => `Book for ${reason.toLowerCase()}`);
    } else if (missingFields?.includes('Appointment_Date__c') || missingFields?.includes('Appointment_Time__c') || guidedFlow?.time === null) {
      // Suggest time slots
      suggestions = [
        'Tomorrow at 10:00 AM',
        'Next Monday at 2:00 PM',
        'This Friday at 3:00 PM'
      ];
    } else if (missingFields?.includes('Location__c') || guidedFlow?.location === null) {
      // Suggest locations
      const preferredLocation = previousAppointments.length > 0 ? getMostFrequent(previousAppointments.map(appt => appt.Location__c).filter(Boolean)) : null;
      suggestions = [
        preferredLocation || 'Brooklyn',
        'Manhattan',
        'New York'
      ];
    } else {
      // Default or confirmation suggestions
      suggestions = [
        'Confirm appointment',
        'Reschedule appointment',
        'Cancel appointment'
      ];
    }

    const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}
${PromptTemplates.errorHandling}

Objective: Generate 3 contextually relevant quick reply suggestions.

Context:
- Chat History: ${formattedChatHistory}
- Latest Query: ${userQuery}
- User Type: ${userType}
- Salesforce Data: ${sfContext || 'None available.'}
- Missing Fields: ${missingFields?.join(', ') || 'None'}
- Guided Flow: ${JSON.stringify(guidedFlow || {})}
- Previous Appointments: ${previousAppointments.map(appt => appt.Reason_for_Visit__c).filter(Boolean).join(', ') || 'None'}
- Banker Notes: ${bankerNotes.join('; ') || 'None'}

Instructions:
1. Analyze chat history, latest query, missing fields, and guided flow to understand user intent.
2. If missingFields includes 'Reason_for_Visit__c' or guidedFlow.reason is null, suggest appointment reasons from: ${prioritizedReasons.join(', ')}.
3. If missingFields includes 'Appointment_Date__c' or 'Appointment_Time__c' or guidedFlow.time is null, suggest time slots (e.g., "Tomorrow at 10:00 AM").
4. If missingFields includes 'Location__c' or guidedFlow.location is null, suggest branch locations (e.g., "Brooklyn", "Manhattan").
5. If no missing fields and guidedFlow is complete, suggest confirmation, rescheduling, or cancellation.
6. Use customer data to prioritize suggestions (e.g., frequent reasons or preferred locations).
7. Keep suggestions concise (5–10 words each).

Output Schema:
{
  "suggestions": ["string", "string", "string"],
  "error": "string|null"
}
`;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate 3 quick reply suggestions.' }
      ],
      max_tokens: 150,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const responseContent = openaiResponse.choices[0].message.content.trim();
    let parsedSuggestions = [];
    
    try {
      const parsedResponse = JSON.parse(responseContent);
      parsedSuggestions = parsedResponse.suggestions || suggestions; // Fallback to computed suggestions
      if (parsedSuggestions.length > 3) {
        parsedSuggestions = parsedSuggestions.slice(0, 3);
      } else if (parsedSuggestions.length < 3) {
        parsedSuggestions = [...parsedSuggestions, ...suggestions.slice(parsedSuggestions.length, 3)];
      }
    } catch (error) {
      console.error('Error parsing suggestions:', error);
      parsedSuggestions = suggestions; // Fallback to computed suggestions
    }

    res.json({ suggestions: parsedSuggestions });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({
      message: 'Failed to generate suggestions',
      error: error.message,
      suggestions: ['Book an appointment', 'Find nearest branch', 'I need help']
    });
  }
});

// Helper Functions
async function saveChatHistoryToSalesforce({ contactId, chatHistory, referralState }) {
  try {
    console.log('Saving chat history:', { referralState });
    const conn = getSalesforceConnection();
    const query = `SELECT Id FROM Chat_Session__c WHERE Contact__c = '${contactId}' AND Appointment_Status__c = 'in_progress'`;
    const result = await conn.query(query);
    let recordId = result.records.length > 0 ? result.records[0].Id : null;
    const now = new Date().toISOString();
    const data = {
      Name: `Chat History for ${contactId}`,
      Contact__c: contactId,
      History__c: JSON.stringify(chatHistory),
      Appointment_Status__c: referralState,
      Last_Updated__c: now
    };
    if (recordId) {
      await conn.sobject('Chat_Session__c').update({ Id: recordId, ...data });
      console.log('Updated chat session:', recordId);
      return recordId;
    } else {
      const createResult = await conn.sobject('Chat_Session__c').create(data);
      console.log('Created chat session:', createResult.id);
      return createResult.id;
    }
  } catch (error) {
    console.error('Error saving chat history:', error);
    throw error;
  }
}

async function loadChatHistoryFromSalesforce(contactId) {
  try {
    const conn = getSalesforceConnection();
    const query = `SELECT Id, History__c, Appointment_Status__c FROM Chat_Session__c WHERE Contact__c = '${contactId}' ORDER BY Last_Updated__c DESC LIMIT 1`;
    const result = await conn.query(query);
    if (result.records.length > 0) {
      const record = result.records[0];
      return {
        id: record.Id,
        chatHistory: record.History__c ? JSON.parse(record.History__c) : [],
        referralState: record.Appointment_Status__c
      };
    }
    return null;
  } catch (error) {
    console.error('Error loading chat history:', error);
    return null;
  }
}

async function generatePersonalizedGreeting(customerType, customerInfo, username, incompleteAppointment = null) {
  try {
    const contextData = customerInfo?.chatHistory
      ?.filter(msg => msg.role === 'user' && (msg.content.includes('reason') || msg.content.includes('appointment')))
      .map(msg => msg.content)
      .join('; ') || 'No specific reasons provided.';

    const appointmentContext = incompleteAppointment && Object.values(incompleteAppointment).some(val => val)
      ? `Unfinished Appointment:\n` +
        `- Reason: ${incompleteAppointment.reason || 'Not specified'}\n` +
        `- Date: ${incompleteAppointment.date || 'Not specified'}\n` +
        `- Time: ${incompleteAppointment.time || 'Not specified'}\n` +
        `- Location: ${incompleteAppointment.location || 'Not specified'}\n` +
        (incompleteAppointment.appointmentId ? `- Appointment ID: ${incompleteAppointment.appointmentId}\n` : '')
      : '';

    const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}

Objective: Generate a personalized greeting for a banking customer.

Context:
- Customer Type: ${customerType}
- Username: ${username || 'Guest'}
- Previous Interactions: ${contextData}
- ${appointmentContext || 'No unfinished appointment.'}

Instructions:
1. Welcome the user by name (or "Guest" if none).
2. Acknowledge customer type ("valued customer" or "guest").
3. If an unfinished appointment exists, summarize details and ask if they want to continue or reschedule.
4. If prior interactions exist, reference past reasons subtly.
5. End with a question (e.g., "How can I assist you today?").
6. Keep the response concise (50-75 tokens), warm, and professional.

Output Schema:
{
  "greeting": "string"
}
`;

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }],
      max_tokens: 100,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const { greeting } = JSON.parse(openaiResponse.choices[0].message.content.trim());
    return greeting;
  } catch (error) {
    console.error('Error generating greeting:', error);
    return `Welcome${username ? `, ${username}` : ''}! How can I assist you today?`;
  }
}

async function verifyConfirmation(text, chatHistory) {
  console.log('Verifying confirmation:', text);
  try {
    const prompt = `
${PromptTemplates.persona}
${PromptTemplates.outputFormat}
${PromptTemplates.reasoning}

Objective: Determine if the user has confirmed an appointment action (booking, rescheduling, or cancellation).

Context:
- User Input: ${text}
- Recent Chat History: ${JSON.stringify(chatHistory.slice(-3))}

Instructions:
1. Analyze the user input and recent chat history.
2. Check for explicit confirmation (e.g., "confirm", "yes", "book it", "reschedule it", "cancel it").
3. Return true if confirmed, false otherwise.

Output Schema:
{
  "isConfirmed": boolean
}
`;

    const messages = [
      { role: 'system', content: prompt },
      ...chatHistory
        .filter(msg => msg.role !== 'system')
        .slice(-3)
        .map(msg => ({ role: msg.role, content: msg.role === 'assistant' ? JSON.parse(msg.content).response || msg.content : msg.content })),
      { role: 'user', content: text }
    ];

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 50,
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const { isConfirmed } = JSON.parse(openaiResponse.choices[0].message.content.trim());
    console.log('Confirmation result:', isConfirmed);
    return isConfirmed;
  } catch (error) {
    console.error('Error verifying confirmation:', error);
    return false;
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});