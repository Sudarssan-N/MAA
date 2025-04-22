const express = require('express');
const jsforce = require('jsforce');
const { OpenAI } = require('openai');
require('dotenv').config();
const cors = require('cors');
const session = require('express-session');

const app = express();
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:4173',
  credentials: true,
}));

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

// NEW: Helper function to remove inline comments from a JSON string.
function removeCommentsFromJSON(jsonStr) {
  // This regex removes any inline comments (// ...) from the JSON string.
  return jsonStr.replace(/\/\/.*(?=[\n\r])/g, '');
}

function extractJSON(str) {
  console.log('Extracting JSON from string:', str);
  const codeBlockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/;
  const codeBlockMatch = str.match(codeBlockRegex);
  
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      // Remove comments before parsing
      const cleaned = removeCommentsFromJSON(codeBlockMatch[1]);
      const parsed = JSON.parse(cleaned);
      console.log('Successfully parsed JSON from code block:', parsed);
      return cleaned;
    } catch (e) {
      console.error('Error parsing JSON from code block:', e.message);
    }
  }
  
  const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
  const matches = str.match(jsonRegex);
  
  if (matches) {
    for (const match of matches) {
      try {
        const cleaned = removeCommentsFromJSON(match);
        const parsed = JSON.parse(cleaned);
        console.log('Successfully parsed JSON from regex match:', parsed);
        return cleaned;
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
    const query = 'SELECT Id, Reason_for_Visit__c, Appointment_Date__c, Appointment_Time__c, Location__c ' +
                  'FROM Appointment__c WHERE Contact__c = \'003dM000005H5A7QAK\'';
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

function parseOverrideDateTime(dateTimeStr) {
  console.log('Parsing override date/time string:', dateTimeStr);
  if (!dateTimeStr) return { date: null, time: null };

  // Flexible regex for formats like "March 19th 10AM", "March 19 10:00 AM", etc.
  const overrideRegex = /(\w+)\s+(\d{1,2}(?:th|st|nd|rd)?)(?:,?\s+(\d{4}))?\s+(\d{1,2}(?::\d{2})?\s*(AM|PM))/i;
  const match = dateTimeStr.match(overrideRegex);

  if (!match) {
    console.log('Invalid override date/time format:', dateTimeStr);
    return { date: null, time: null };
  }

  const [, monthStr, dayStr, yearStr, timeStr, modifier] = match;
  const currentYear = new Date().getFullYear(); // Use 2025 based on current date (March 17, 2025)
  const year = yearStr ? parseInt(yearStr, 10) : currentYear;

  // Map month string to number
  const monthMap = {
    january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
    april: '04', apr: '04', may: '05', june: '06', jun: '06', july: '07', jul: '07',
    august: '08', aug: '08', september: '09', sep: '09', october: '10', oct: '10',
    november: '11', nov: '11', december: '12', dec: '12'
  };
  const month = monthMap[monthStr.toLowerCase()];
  if (!month) {
    console.log('Invalid month:', monthStr);
    return { date: null, time: null };
  }

  const day = dayStr.replace(/(th|st|nd|rd)/i, '').padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  // Validate date
  const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(dateObj.getTime())) {
    console.log('Invalid date constructed:', dateStr);
    return { date: null, time: null };
  }

  console.log('Parsed override date and time:', { date: dateStr, time: timeStr });
  return { date: dateStr, time: timeStr };
}

app.post('/api/guidedFlow', async (req, res) => {
  try {
    const { query, customerType, guidedStep } = req.body;
    if (!query || !customerType || !guidedStep) {
      return res.status(400).json({ message: 'Missing query, customerType, or guidedStep' });
    }

    if (!req.session) {
      return res.status(401).json({ message: 'Session expired or invalid', error: 'SESSION_EXPIRED' });
    }

    initGuidedFlowSession(req);
    const flowData = req.session.guidedFlow;

    let systemInstructions = '';
    switch (guidedStep) {
      case 'reasonSelection':
        flowData.reason = query;
        systemInstructions = `
        User selected a reason: ${flowData.reason}.
        Provide 3 location options in "locationOptions": [ "Manhattan", "New York", "Brooklyn"].
        Return them in a JSON array. Also provide a "response" to ask the user to choose a location.
        `;
        break;

      case 'timeSelection':
        let parsedTime = query;
        if (!query.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
          // Not in ISO 8601 format, attempt to parse override input
          const { date, time } = parseOverrideDateTime(query) || {};
          parsedTime = date && time ? combineDateTime(date, time) : null;
          if (!parsedTime) {
            systemInstructions = `
User entered an invalid time slot: ${query}.
Respond with the time slotthat he/she has selected. 
Return an empty "locationOptions" array.
            `;
            req.session.chatHistory.push({ role: 'system', content: systemInstructions });
            req.session.chatHistory.push({ role: 'user', content: query });
            const openaiResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: req.session.chatHistory,
              max_tokens: 500,
              temperature: 0.7,
            });
            const llmOutput = openaiResponse.choices[0].message.content.trim();
            req.session.chatHistory.push({ role: 'assistant', content: llmOutput });
            req.session.save(() => {});
            let parsed;
            try {
              parsed = JSON.parse(llmOutput);
            } catch (err) {
              parsed = JSON.parse(extractJSON(llmOutput));
            }
            return res.json({
              response: parsed.response || "I couldn’t understand that date/time. Please try again.",
              appointmentDetails: null,
              timeSlots: [],
              locationOptions: parsed.locationOptions || [],
            });
          }
        }
        flowData.time = parsedTime;
        systemInstructions = `
        User selected the time slot: ${flowData.time}.
        Now we have reason = ${flowData.reason}, location = ${flowData.location}, time = ${flowData.time}.
        Return a "response" summarizing these choices and ask for confirmation.
        Include "Please confirm your appointment."
        `;
        break;

        case 'locationSelection':
          flowData.location = query;
          systemInstructions = `
          User selected location: ${flowData.location}.
          Please suggest 3 possible appointment date/time slots in ISO 8601 format (e.g., "2025-03-18T14:00:00.000Z").
          Return them under "timeSlots" array in JSON.
          Start the Dates from April 22, 2025.
          Include a "response" that politely offers those slots.
          `;
          break;

      case 'confirmation':
        systemInstructions = `
The user confirmed the appointment with reason = ${flowData.reason}, time = ${flowData.time}, location = ${flowData.location}.
Return a "response" confirming the booking.
Return "appointmentDetails" in JSON with fields: "Id" (leave null for now), "Reason_for_Visit__c", "Appointment_Time__c" (use the ISO 8601 time), "Location__c".
Do not include "Appointment_Date__c".
Example: {"response": "Your appointment is booked!", "appointmentDetails": {"Id": null, "Reason_for_Visit__c": "Open a new account", "Appointment_Time__c": "2025-03-18T14:00:00.000Z", "Location__c": "Brooklyn"}}
        `;
        break;

      default:
        systemInstructions = 'No recognized guided step.';
        break;
    }

    if (!req.session.chatHistory) {
      req.session.chatHistory = [];
    }
    req.session.chatHistory.push({ role: 'system', content: systemInstructions });
    req.session.chatHistory.push({ role: 'user', content: query });

    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: req.session.chatHistory,
      max_tokens: 500,
      temperature: 0.7,
    });

    const llmOutput = openaiResponse.choices[0].message.content.trim();
    req.session.chatHistory.push({ role: 'assistant', content: llmOutput });
    req.session.save(() => {});

    let parsed;
    try {
      parsed = JSON.parse(llmOutput);
    } catch (err) {
      parsed = JSON.parse(extractJSON(llmOutput));
    }

    let formattedTimeSlots = [];
    if (parsed.timeSlots && Array.isArray(parsed.timeSlots)) {
      formattedTimeSlots = parsed.timeSlots.map(slot => ({
        display: formatDateTimeForDisplay(slot),
        raw: slot
      }));
    }

    let appointmentDetails = parsed.appointmentDetails || null;
    if (guidedStep === 'confirmation') {
      try {
        const dateTime = flowData.time;
        if (!dateTime || !dateTime.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
          throw new Error('Invalid date/time format');
        }

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
          parsed.response = parsed.response || "Your appointment has been booked successfully!";
        } else {
          throw new Error('Failed to create appointment in Salesforce');
        }

        req.session.guidedFlow = { reason: null, date: null, time: null, location: null };
      } catch (error) {
        console.error('Error creating appointment in SF:', error);
        return res.status(500).json({ message: 'Failed to create appointment', error: error.message });
      }
    }

    const responsePayload = {
      response: parsed.response || '...',
      appointmentDetails,
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
        response: "I found a branch that meets your criteria. It's located at 123 Main St, Brooklyn, NY 11201. If you would like to Naviage there here is the link: https://goo.gl/maps/12345",
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
You are a bank appointment booking assistant. Based on the user's query and context, suggest appointment details and respond naturally. Maintain conversational flow using the chat history.

Current Date: ${new Date().toISOString().split('T')[0]}
User Query: ${query}
User Type: ${customerType}
${contextData ? `Context Information:\n${contextData}` : 'No prior context available.'}

Extract or suggest:
- Reason_for_Visit__c (Ask customer if not mentioned, suggest from the previous bookings if available)
- Appointment_Date__c (YYYY-MM-DD)
- Appointment_Time__c (HH:MM AM/PM)
- Location__c (Brooklyn, Manhattan, or New York) Ask for Location before going with the time suggestion. Get the location second to the reason for the visit, then time. 
- Banker__c (use the Preferred Banker ID from context if available, otherwise omit it unless specified)

Rules:
- If details are missing, suggest reasonable defaults (e.g., next business day, 9 AM–5 PM, preferred location/banker ID if available), but do not assume a purpose unless the user specifies it.
- Reason_for_Visit__c should be inferred from the user's query and if not provided, ask the user for the reason.
- Your suggestions should be in a suggestive language and not overly explicit; also ask for time, date, or reason if not provided.
- For Banker__c, only include it in appointmentDetails if it's a valid Salesforce ID (e.g., starts with "005" for User records).
- Use prior appointments to infer preferences for Regular customers.
- Respond in natural language under "response" and provide structured data under "appointmentDetails".
- Return JSON like: {"response": "Here's a suggestion...", "appointmentDetails": {...}}

`;
    const systemPrompt = { role: 'system', content: prompt };
    const tempMessages = [...req.session.chatHistory, systemPrompt];

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
    
      const createResult = await conn.sobject('Appointment__c').create(fullAppointmentData);
      if (createResult.success) {
        appointmentId = createResult.id;
        appointmentDetails.Id = appointmentId;
        appointmentDetails.Appointment_Time__c = dateTime;
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

app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
