class OpenAIService {
  static async generatePersonalizedGreeting(customerType, customerInfo, username, incompleteAppointment = null) {
    try {
      let contextData = '';
      if (customerInfo && customerInfo.chatHistory && Array.isArray(customerInfo.chatHistory) && customerInfo.chatHistory.length > 0) {
        const pastReasons = customerInfo.chatHistory
          .filter(msg => msg.role === 'user')
          .map(msg => msg.content)
          .filter(content => content.includes('reason') || content.includes('appointment'))
          .join('; ');
        contextData = `Previous Interactions: ${pastReasons || 'No specific reasons provided.'}`;
      }

      let appointmentContext = '';
      if (incompleteAppointment && incompleteAppointment.reason && incompleteAppointment.date && incompleteAppointment.time && incompleteAppointment.location) {
        appointmentContext = `\n\nUnfinished Appointment Details:\n` +
          `- Reason: ${incompleteAppointment.reason}\n` +
          `- Date: ${incompleteAppointment.date}\n` +
          `- Time: ${incompleteAppointment.time}\n` +
          `- Location: ${incompleteAppointment.location}\n`;
      }

      const prompt = `You are a friendly bank appointment assistant. Generate a personalized greeting for a user based on their customer type, previous interactions, and any unfinished appointment.

The greeting should:
- Welcome the user by name (if available, use "${username}" or "Guest" for guests).
- Reference their customer type (e.g., "valued customer" for Regular, "guest" for Guest).
- If there is an unfinished appointment (with all details: reason, date, time, location), mention the details and ask if the user wants to continue booking it.
- If previous interactions exist, subtly mention past appointment reasons or locations.
- End with a question like "How can I help you today?" or similar.
- Keep the tone warm and professional.
- Return the greeting as a plain string, no JSON or extra formatting.

Customer Type: ${customerType}
Username: ${username || 'Guest'}
${contextData ? `Context Information:\n${contextData}` : 'No prior context available.'}${appointmentContext}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }],
        max_tokens: 100,
        temperature: 0.7,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating personalized greeting:', error);
      return `Welcome${username ? `, ${username}` : ''}! How can I assist you today?`;
    }
  }

  static async verifyConfirmation(text, chatHistory) {
    console.log('Verifying confirmation for text:', text);
    try {
      const messages = [
        { role: 'system', content: 'Return true or false if the user has confirmed booking the appointment.' },
        ...chatHistory
          .filter(msg => msg.role !== 'system')
          .slice(-3)
          .map(msg => ({ 
            role: msg.role, 
            content: msg.role === 'assistant' ? JSON.parse(msg.content).response || msg.content : msg.content 
          })),
        { role: 'user', content: text }
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 50,
        temperature: 0.5,
      });

      const llmOutput = response.choices[0].message.content.trim();
      console.log('Confirmation verification response:', llmOutput);
      return llmOutput.toLowerCase().includes('true') || 
             llmOutput.toLowerCase().includes('confirmed') || 
             llmOutput.toLowerCase().includes('yes');
    } catch (error) {
      console.error('Error verifying confirmation:', error);
      return false;
    }
  }
}
export default OpenAIService;