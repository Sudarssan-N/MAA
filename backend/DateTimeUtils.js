// Utility functions
class DateTimeUtils {
  static formatDateTimeForDisplay(isoDateTime) {
    console.log('Formatting date/time for display:', isoDateTime);
    if (!isoDateTime) return 'Not specified';
    
    const date = new Date(isoDateTime);
    if (isNaN(date.getTime())) return 'Invalid date';
    
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

  static convertTo24HourTime(timeStr) {
    console.log('Converting time to 24-hour format:', timeStr);
    if (!timeStr) return null;
    
    const isoRegex = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d{3}Z$/;
    const isoMatch = timeStr.match(isoRegex);
    if (isoMatch) return isoMatch[1];
    
    const trimmedTimeStr = timeStr.trim();
    const timeRegex = /^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i;
    const match = trimmedTimeStr.match(timeRegex);
    if (!match) return null;
    
    let [_, hours, minutes, modifier] = match;
    hours = parseInt(hours, 10);
    minutes = minutes ? parseInt(minutes, 10) : 0;
    
    if (hours > 23 || hours < 0 || minutes > 59 || minutes < 0) return null;
    
    if (modifier) {
      modifier = modifier.toUpperCase();
      if (modifier === 'PM' && hours !== 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  static combineDateTime(dateStr, timeStr) {
    console.log('Combining date and time:', { dateStr, timeStr });
    if (!dateStr || !timeStr) return null;
    
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    if (isoRegex.test(timeStr)) return timeStr;
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) return null;
    
    const time24 = this.convertTo24HourTime(timeStr);
    if (!time24) return null;
    
    return `${dateStr}T${time24}.000Z`;
  }

  static parseDateTimeString(dateTimeStr) {
    console.log('Parsing date/time string:', dateTimeStr);
    if (!dateTimeStr) return { date: null, time: null };
    
    const parts = dateTimeStr.match(/(\w+ \d{1,2}, \d{4}), (\d{1,2}:\d{2} [AP]M)/i);
    if (!parts) return { date: null, time: null };
    
    const [, datePart, timePart] = parts;
    const dateObj = new Date(datePart);
    if (isNaN(dateObj.getTime())) return { date: null, time: null };
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return { date: `${year}-${month}-${day}`, time: timePart };
  }
}
export default DateTimeUtils;