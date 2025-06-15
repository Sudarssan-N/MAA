class JSONUtils {
  static extractJSON(str) {
    console.log('Extracting JSON from string:', str);
    
    // Try code block first
    const codeBlockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/;
    const codeBlockMatch = str.match(codeBlockRegex);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        JSON.parse(codeBlockMatch[1]);
        return codeBlockMatch[1];
      } catch (e) {
        console.error('Error parsing JSON from code block:', e.message);
      }
    }
    
    // Try regex match
    const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
    const matches = str.match(jsonRegex);
    if (matches) {
      for (const match of matches) {
        try {
          JSON.parse(match);
          return match;
        } catch (e) {
          console.error('Error parsing JSON from regex match:', e.message);
        }
      }
    }
    
    return '{}';
  }

  static getMostFrequent(arr) {
    if (!arr.length) return null;
    
    const counts = arr.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }
}
export default JSONUtils;