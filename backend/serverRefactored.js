import express from 'express';
import SalesforceService from './SalesforceService.js';
import OpenAIService from './OpenAIService.js';
import DateTimeUtils from './DateTimeUtils.js';
import JSONUtils from './JsonUtils.js';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';

// Load environment variables
dotenv.config();

// Configuration
const config = {
  port: process.env.PORT || 3000,
  staticUsername: process.env.STATIC_USERNAME || 'Jack Rogers',
  staticPassword: process.env.STATIC_PASSWORD || 'password123',
  salesforceAccessToken: process.env.SALESFORCE_ACCESS_TOKEN,
  salesforceInstanceUrl: process.env.SALESFORCE_INSTANCE_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
  sessionSecret: process.env.SESSION_SECRET,
  contactId: '003dM000005H5A7QAK' // Consider moving to env
};

// Initialize Express app
const app = express();

// Middleware setup
const setupMiddleware = (app) => {
  app.use(express.json({ limit: '10mb' }));
  
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
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600000, // 1 hour
      httpOnly: true
    }
  }));
};

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: config.openaiApiKey
});

// Product mapping and constants
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

// Session utilities
const initGuidedFlowSession = (req) => {
  if (!req.session.guidedFlow) {
    req.session.guidedFlow = {
      reason: null,
      date: null,
      time: null,
      location: null
    };
  }
};

// Middleware
const authenticate = (req, res, next) => {
  console.log('Authenticating request, session user:', req.session.user);
  if (!req.session.user || req.session.user.username !== config.staticUsername) {
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

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
};


const setupRoutes = (app) => {
  // Authentication routes
    app.post('/api/generate-greeting', optionalAuthenticate, async (req, res) => {
      const customerType = req.user && req.user.username !== 'guest' ? 'Valued Customer' : 'Guest';
      const username = req.user ? req.user.username : 'Guest';
      console.log('Generating personalized greeting for:', { customerType, username });
    
      try {
        let contextData = '';
        if (req.session.chatHistory && Array.isArray(req.session.chatHistory) && req.session.chatHistory.length > 0) {
          const pastReasons = req.session.chatHistory
            .filter(msg => msg.role === 'user')
            .map(msg => msg.content)
            .filter(content => content.includes('reason') || content.includes('appointment'))
            .join('; ');
          contextData = `Previous Interactions: ${pastReasons || 'No specific reasons provided.'}`;
        }
    
        let appointmentContext = '';
        const incompleteAppointment = req.session.guidedFlow;
        if (incompleteAppointment && (incompleteAppointment.reason || incompleteAppointment.date || incompleteAppointment.time || incompleteAppointment.location)) {
          appointmentContext = `\n\nUnfinished Appointment Details:\n` +
            `- Reason: ${incompleteAppointment.reason || 'Not specified'}\n` +
            `- Date: ${incompleteAppointment.date || 'Not specified'}\n` +
            `- Time: ${incompleteAppointment.time || 'Not specified'}\n` +
            `- Location: ${incompleteAppointment.location || 'Not specified'}\n`;
        }
    
        const prompt = `
    You are a friendly bank appointment assistant. Generate a personalized greeting for a user based on their customer type, previous interactions, and any unfinished appointment.
    \n\nThe greeting should:\n- Welcome the user by name (if available, use \"${username}\" or \"Guest\" for guests).\n- Reference their customer type (e.g., 
    \"valued customer\" for Regular, \"guest\" for Guest).\n- If there is an unfinished appointment, mention the details (reason, date, time, location) and 
    ask if the user wants to continue booking it.\n- If previous interactions exist, subtly mention past appointment reasons or locations.\n- 
    End with a question like \"How can I help you today?\" or similar.\n- Keep the tone warm and professional.\n- Return the greeting as a plain string, no
     JSON or extra formatting.\n\nCustomer Type: ${customerType}\nUsername: ${username || 'Guest'}\n${contextData ? `Context Information:\n${contextData}` : 'No prior context available.'}${appointmentContext}
    `;
    
        const openaiResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: prompt }],
          max_tokens: 100,
          temperature: 0.7,
        });
    
        const greeting = openaiResponse.choices[0].message.content.trim();
        console.log('Generated greeting:', greeting);
        return res.json({ greeting });
      } catch (error) {
        console.error('Error generating personalized greeting:', error);
        const fallbackGreeting = `Welcome${username ? `, ${username}` : ''}! How can I assist you today?`;
        return res.json({ greeting: fallbackGreeting });
      }
    });



  app.post('/api/auth/login', async (req, res) => {
    console.log('Login request received:', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ message: 'Missing username or password' });
    }
    
    if (username !== config.staticUsername || password !== config.staticPassword) {
      console.log('Invalid credentials');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.user = { username };
    req.session.referralState = 'in_progress';
    req.session.sfChatId = null;
    console.log('User logged in, session updated:', req.session.user);

    try {
      const conn = SalesforceService.getSalesforceConnection();
      const query = `SELECT Id, History__c, Appointment_Status__c FROM Chat_Session__c WHERE Contact__c = '${config.contactId}' AND Appointment_Status__c = 'in_progress' ORDER BY Last_Updated__c DESC LIMIT 1`;
      const result = await conn.query(query);
      let greeting;
      let incompleteAppointment = null;

      if (result.records.length > 0) {
        // Reuse existing in-progress session
        const sfChat = {
          id: result.records[0].Id,
          chatHistory: result.records[0].History__c ? JSON.parse(result.records[0].History__c) : { chatHistory: [], guidedFlow: { reason: null, date: null, time: null, location: null } },
          referralState: result.records[0].Appointment_Status__c,
        };
        
        req.session.chatHistory = sfChat.chatHistory.chatHistory || [];
        req.session.guidedFlow = sfChat.chatHistory.guidedFlow || { reason: null, date: null, time: null, location: null };
        req.session.referralState = sfChat.referralState;
        req.session.sfChatId = sfChat.id;
        console.log('Reusing existing in-progress chat session:', sfChat.id);

        const guided = req.session.guidedFlow;
        if (guided && (guided.reason || guided.date || guided.time || guided.location)) {
          incompleteAppointment = guided;
        }

        greeting = await OpenAIService.generatePersonalizedGreeting(
          'Regular',
          { chatHistory: req.session.chatHistory, guidedFlow: req.session.guidedFlow },
          username,
          incompleteAppointment
        );
      } else {
        // Initialize new session
        req.session.chatHistory = [];
        req.session.guidedFlow = { reason: null, date: null, time: null, location: null };
        req.session.referralState = 'in_progress';
        greeting = await OpenAIService.generatePersonalizedGreeting('Regular', null, username, null);

        req.session.chatHistory = [
          { role: 'assistant', content: JSON.stringify({ response: greeting, appointmentDetails: null }) }
        ];

        req.session.sfChatId = await SalesforceService.saveChatHistoryToSalesforce({
          contactId: config.contactId,
          chatHistory: {
            guidedFlow: req.session.guidedFlow,
            chatHistory: req.session.chatHistory
          },
          referralState: 'in_progress'
        });
        console.log('Created new chat session:', req.session.sfChatId);
      }

      res.json({
        message: 'Login successful',
        username,
        greeting,
        chatHistory: req.session.chatHistory,
        guidedFlow: req.session.guidedFlow
      });
    } catch (error) {
      console.error('Error managing chat session on login:', error);
      res.status(500).json({ message: 'Login failed', error: error.message });
    }
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
    if (req.session.user && req.session.user.username === config.staticUsername) {
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


  // SFDC Appointment API call
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

    // SFDC Appointment creation
    app.post('/api/salesforce/appointments', authenticate, async (req, res) => {
    console.log('Received request to create appointment:', JSON.stringify(req.body, null, 2));
    try {
      const conn = SalesforceService.getSalesforceConnection();
      const appointmentData = {
        ...req.body,
        Contact__c: config.contactId
      };
      
      console.log('Salesforce appointment data to create:', JSON.stringify(appointmentData, null, 2));
      
      const result = await conn.sobject('Appointment__c').create(appointmentData);
      
      if (result.success) {
        console.log('Appointment created successfully with ID:', result.id);
        
        // Update chat session if exists
        if (req.session.sfChatId) {
          await conn.sobject('Chat_Session__c').update({
            Id: req.session.sfChatId,
            Appointment_Status__c: 'completed',
            Last_Updated__c: new Date().toISOString()
          });
          console.log('Chat session marked as completed:', req.session.sfChatId);
          req.session.referralState = 'completed';
        }

        // Reset session data
        req.session.chatHistory = [];
        req.session.guidedFlow = { reason: null, date: null, time: null, location: null };
        req.session.sfChatId = null;

        res.json({ 
          message: 'Appointment created', 
          id: result.id 
        });
      } else {
        console.error('Failed to create appointment:', result);
        res.status(500).json({ 
          message: 'Failed to create appointment',
          errors: result.errors || []
        });
      }
    } catch (error) {
      console.error('Error creating appointment:', error.message);
      res.status(500).json({ 
        message: 'Failed to create appointment', 
        error: error.message 
      });
    }
  }); 

    // Chat route
  app.post('/api/chat', optionalAuthenticate, async (req, res) => {
    console.log('Received chat request:', JSON.stringify(req.body, null, 2));
    
    try {
      const { query, customerType } = req.body;
      
      // Validate input
      if (!query || !customerType) {
        console.log('Missing query or customerType');
        return res.status(400).json({ 
          message: 'Missing query or customerType' 
        });
      }

      // Check session
      if (!req.session) {
        console.error('No session object found');
        return res.status(401).json({ 
          message: 'Session expired or invalid', 
          error: 'SESSION_EXPIRED', 
          recovery: true 
        });
      }

      const username = req.session.user ? req.session.user.username : 'Guest';
      const isRegularCustomer = customerType === 'Regular' || customerType === 'customer';

      // Initialize or load chat session
      if (!req.session.sfChatId) {
        await initializeChatSession(req, config.contactId);
      }

      // Handle predefined branch query
      const branchQuery = "Find me a branch within 5 miles with 24hrs Drive-thru ATM service";
      if (query.toLowerCase().includes(branchQuery.toLowerCase())) {
        return await handleBranchQuery(req, res, query, config.contactId);
      }

      // Get Salesforce connection and context data
      let conn;
      try {
        conn = SalesforceService.getSalesforceConnection();
      } catch (error) {
        console.error('Error connecting to Salesforce:', error.message);
        return res.status(500).json({ 
          message: 'Salesforce connection failed' 
        });
      }

      // Get previous appointments context for regular customers
      let contextData = '';
      let previousAppointments = [];
      
      if (isRegularCustomer) {
        const appointmentsResult = await getCustomerAppointments(conn, config.contactId);
        previousAppointments = appointmentsResult.appointments;
        contextData = appointmentsResult.contextData;
      }

      // Add user query to chat history
      req.session.chatHistory.push({ role: 'user', content: query });

      // Generate AI response
      const aiResponse = await generateChatResponse(
        query, 
        customerType, 
        contextData, 
        req.session.chatHistory
      );

      // Add AI response to chat history
      req.session.chatHistory.push({ role: 'assistant', content: aiResponse });

      // Save chat history
      try {
        req.session.sfChatId = await SalesforceService.saveChatHistoryToSalesforce({
          contactId: config.contactId,
          chatHistory: {
            guidedFlow: req.session.guidedFlow || { reason: null, date: null, time: null, location: null },
            chatHistory: req.session.chatHistory
          },
          referralState: 'in_progress'
        });
        console.log('Chat history saved to Salesforce:', req.session.sfChatId);
      } catch (error) {
        console.error('Error saving chat history to Salesforce:', error);
      }
      // Save session
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session:', err);
        } else {
          console.log('Session saved successfully');
        }
      });

      // Parse and process AI response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(aiResponse);
        console.log('Parsed OpenAI response successfully:', parsedResponse);
      } catch (error) {
        console.error('Failed to parse OpenAI response as JSON:', error.message);
        parsedResponse = JSON.parse(JSONUtils.extractJSON(aiResponse));
        console.log('Extracted and parsed JSON from OpenAI response:', parsedResponse);
      }

      const { response, appointmentDetails } = parsedResponse;

      // Handle appointment creation if all required fields are present
      if (appointmentDetails && areAllRequiredFieldsPresent(appointmentDetails)) {
        const isConfirmed = await OpenAIService.verifyConfirmation(query, req.session.chatHistory);
        
        if (isConfirmed) {
          const appointmentResult = await createAppointment(conn, appointmentDetails, req.session, config.contactId);
          if (appointmentResult.success) {
            parsedResponse.appointmentDetails.Id = appointmentResult.id;
          }
        }
      }

      // Prepare response
      const responseData = {
        response,
        appointmentDetails,
        missingFields: parsedResponse.missingFields || [],
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

  app.use(errorHandler);
};

// Initialize application
const initializeApp = () => {
  setupMiddleware(app);
  setupRoutes(app);
  
  app.listen(config.port, () => {
    console.log(`Backend server is running on port ${config.port}`);
  });
};

// Start the application

initializeApp();