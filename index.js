require('dotenv').config();
const { WebhookClient, Payload } = require('dialogflow-fulfillment');
const express = require("express");
const axios = require('axios'); // We'll use axios for making HTTP requests to Google Apps Script
const cors = require("cors");
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// Replace with your Google Apps Script web app URL
const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbya06VDEfRtQnoqLqMZM6rkPjifXK7Q8qmT7vUi1_RdxPs5JpIksv65rHUEYGnm6xmY/exec';

app.post('/webhook', async (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });

  // Generate a unique reference ID
  function generateReferenceId() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  // Welcome Intent (restored)
  async function hi(agent) {
    console.log(`intent => hi`);

    // Instead of logging to SheetDB, we'll log via Google Sheets
    try {
      await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, {
        customer_type: "New Interaction",
        query: "Welcome Intent"
      });
    } catch (error) {
      console.error('Error logging to Google Sheet:', error);
    }

    agent.add("Hello, I’m HVAC Assist. What product can I help you with? ");

    const richContentPayload = {
      "richContent": [
        [
          {
            "type": "chips",
            "options": [
              {
                "text": "Tankless"
              },
              {
                "text": "Furnace"
              },
              {
                "text": "Heat Pump"
              },
              {
                "text": "A/C"
              },
              {
                "text": "Repairs/maintenance"
              }
            ]
          }
        ]
      ]
    };

    agent.add(new Payload(agent.UNSPECIFIED, richContentPayload, { rawPayload: true, sendAsMessage: true }));
  }

  
  // Intent for initial service selection
  async function serviceSelectionIntent(agent) {
    console.log(`intent => serviceSelection`);

    // Log interaction to Google Sheets
    try {
      await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, {
        customer_type: "Service Selection",
        query: agent.query
      });
    } catch (error) {
      console.error('Error logging to Google Sheet:', error);
    }

    // Set context for service selection
    const selectedService = agent.query;
    agent.setContext({
      name: 'service-context',
      lifespan: 5,
      parameters: { selectedService }
    });

    // Property type selection
    agent.add("Sure we can help with that ?");

    const richContentPayload = {
      "richContent": [
        [
          {
            "type": "chips",
            "options": [
              {
                "text": "Residential Property"
              },
              {
                "text": "Commercial Property"
              }
            ]
          }
        ]
      ]
    };

    agent.add(new Payload(agent.UNSPECIFIED, richContentPayload, { rawPayload: true, sendAsMessage: true }));
  }


  // Intent for property type selection
  async function propertyTypeIntent(agent) {
    console.log(`intent => propertyType`);

    // Get service from previous context
    const serviceContext = agent.getContext('service-context');
    const selectedService = serviceContext.parameters.selectedService;
    const selectedPropertyType = agent.query;

    // Set context for property type
    agent.setContext({
      name: 'property-context',
      lifespan: 5,
      parameters: {
        selectedService,
        selectedPropertyType
      }
    });

    // Ask for user information
    agent.add(`Thank you, our ${selectedService} Consultant will contact you within the next 2-10 minutes to go over the details and pricing. Can I please have your name ?`);
  }

  // Intent for collecting name
  async function collectNameIntent(agent) {
    console.log(`intent => collectName`);
    const name = agent.query;

    // Get previous contexts
    const serviceContext = agent.getContext('service-context');
    const propertyContext = agent.getContext('property-context');

    // Set context for name
    agent.setContext({
      name: 'name-context',
      lifespan: 5,
      parameters: {
        name,
        selectedService: propertyContext.parameters.selectedService,
        selectedPropertyType: propertyContext.parameters.selectedPropertyType
      }
    });

    agent.add("Can I please have your Phone number ?");
  }

  // Intent for collecting phone and saving data
  async function saveInformationIntent(agent) {
    console.log(`intent => saveInformation`);
    const phone = agent.query;

    const nameContext = agent.getContext('name-context');
    const referenceId = generateReferenceId();

    try {
      const payload = {
        reference_id: referenceId,
        service: nameContext.parameters.selectedService,
        property_type: nameContext.parameters.selectedPropertyType,
        name: nameContext.parameters.name,
        phone: phone,
        // timestamp: new Date().toISOString()
      };

      console.log('Sending payload:', payload);

      const response = await axios.post(GOOGLE_SHEETS_WEBHOOK_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      console.log('Response from Google Sheets:', response.data);

      agent.add(`Thank ${nameContext.parameters.name}. We will be be in touch with you shortly. Is there anything else I can assist you with today? `);
      // Add a new rich content payload with options
      const followupPayload = {
        "richContent": [
          [
            {
              "type": "chips",
              "options": [
                {
                  "text": "Yes"
                },
                {
                  "text": "No"
                }
              ]
            }
          ]
        ]
      };

      agent.add(new Payload(agent.UNSPECIFIED, followupPayload, { rawPayload: true, sendAsMessage: true }));
    }
    catch (error) {
      console.error('Detailed Error:', {
        message: error.message,
        code: error.code,
        response: error.response ? error.response.data : 'No response',
        status: error.response ? error.response.status : 'Unknown'
      });

      agent.add("I'm sorry, but there was an issue saving your information. Please try again later.");
    }
  }

  // Intent Map
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', hi);
  // intentMap.set('yes', Yes);
  intentMap.set('Service Selection Intent', serviceSelectionIntent);
  intentMap.set('Property Type Intent', propertyTypeIntent);
  intentMap.set('Collect Name Intent', collectNameIntent);
  intentMap.set('Save Information Intent', saveInformationIntent);

  agent.handleRequest(intentMap);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});