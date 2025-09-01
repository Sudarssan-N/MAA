class SalesforceService {
  static getSalesforceConnection() {
    console.log('Attempting to establish Salesforce connection');
    if (!config.salesforceAccessToken || !config.salesforceInstanceUrl) {
      throw new Error('Salesforce credentials not configured in environment');
    }
    
    const conn = new jsforce.Connection({
      instanceUrl: config.salesforceInstanceUrl,
      accessToken: config.salesforceAccessToken,
    });
    
    console.log('Salesforce connection established successfully');
    return conn;
  }

  static async saveChatHistoryToSalesforce({ contactId, chatHistory, referralState }) {
    try {
      console.log('Saving chat history to Salesforce with referralState:', referralState);
      const conn = this.getSalesforceConnection();
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
        console.log('Updated existing chat session:', recordId);
        return recordId;
      } else {
        const createResult = await conn.sobject('Chat_Session__c').create(data);
        console.log('Created new chat session:', createResult.id);
        return createResult.id;
      }
    } catch (error) {
      console.error('Error saving chat history to Salesforce:', error);
      throw error;
    }
  }

  static async loadChatHistoryFromSalesforce(contactId) {
    try {
      const conn = this.getSalesforceConnection();
      const query = `SELECT Id, History__c, Appointment_Status__c FROM Chat_Session__c WHERE Contact__c = '${contactId}' ORDER BY Last_Updated__c DESC LIMIT 1`;
      const result = await conn.query(query);
      
      if (result.records.length > 0) {
        const record = result.records[0];
        const chatHistory = record.History__c ? JSON.parse(record.History__c) : {
          chatHistory: [],
          guidedFlow: { reason: null, date: null, time: null, location: null }
        };
        
        if (record.Appointment_Status__c === 'completed') {
          chatHistory.guidedFlow = { reason: null, date: null, time: null, location: null };
        }
        
        return {
          id: record.Id,
          chatHistory,
          referralState: record.Appointment_Status__c
        };
      }
      return null;
    } catch (error) {
      console.error('Error loading chat history from Salesforce:', error);
      return null;
    }
  }
}
export default SalesforceService;