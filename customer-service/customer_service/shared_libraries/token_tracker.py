"""
Token Usage Monitoring and Reporting Utilities for MAA Agent
"""
import time
import json
from datetime import datetime
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class TokenUsageTracker:
    """Utility class for tracking and reporting token usage."""
    
    @staticmethod
    def get_session_stats(session_state: Dict[str, Any]) -> Dict[str, Any]:
        """Get comprehensive token usage statistics for a session."""
        
        if "token_stats" not in session_state:
            return {
                "status": "no_data",
                "message": "No token usage data available for this session"
            }
        
        stats = session_state["token_stats"]
        current_time = time.time()
        session_duration = current_time - stats["session_start"]
        
        total_tokens = stats["total_input_tokens"] + stats["total_output_tokens"]
        avg_tokens_per_request = total_tokens / max(1, stats["total_requests"])
        tokens_per_minute = (total_tokens / max(1, session_duration)) * 60
        
        return {
            "status": "success",
            "session_duration_minutes": round(session_duration / 60, 2),
            "total_requests": stats["total_requests"],
            "input_tokens": stats["total_input_tokens"],
            "output_tokens": stats["total_output_tokens"], 
            "total_tokens": total_tokens,
            "average_tokens_per_request": round(avg_tokens_per_request, 2),
            "tokens_per_minute": round(tokens_per_minute, 2),
            "input_output_ratio": round(stats["total_input_tokens"] / max(1, stats["total_output_tokens"]), 2),
            "cost_estimation": TokenUsageTracker.estimate_cost(total_tokens, stats["total_requests"])
        }
    
    @staticmethod
    def estimate_cost(total_tokens: int, total_requests: int, model_name: str = "gemini-2.5-flash") -> Dict[str, Any]:
        """Estimate costs based on token usage."""
        
        # Gemini pricing (as of 2024 - update as needed)
        pricing = {
            "gemini-1.5-flash": {
                "input_cost_per_1k": 0.000075,  # $0.075 per 1M tokens
                "output_cost_per_1k": 0.0003,   # $0.30 per 1M tokens
            },
            "gemini-1.5-pro": {
                "input_cost_per_1k": 0.00125,   # $1.25 per 1M tokens 
                "output_cost_per_1k": 0.005,    # $5.00 per 1M tokens
            },
            "gemini-2.5-flash": {
                "input_cost_per_1k": 0.000075,  # Assumed similar to 1.5-flash
                "output_cost_per_1k": 0.0003,
            }
        }
        
        if model_name not in pricing:
            model_name = "gemini-2.5-flash"  # Default fallback
        
        model_pricing = pricing[model_name]
        
        # Rough estimation assuming 60/40 input/output split
        estimated_input_tokens = int(total_tokens * 0.6)
        estimated_output_tokens = int(total_tokens * 0.4)
        
        input_cost = (estimated_input_tokens / 1000) * model_pricing["input_cost_per_1k"]
        output_cost = (estimated_output_tokens / 1000) * model_pricing["output_cost_per_1k"]
        total_cost = input_cost + output_cost
        
        return {
            "model": model_name,
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "input_cost_usd": round(input_cost, 6),
            "output_cost_usd": round(output_cost, 6),
            "total_cost_usd": round(total_cost, 6),
            "cost_per_request_usd": round(total_cost / max(1, total_requests), 6)
        }
    
    @staticmethod
    def log_usage_summary(session_state: Dict[str, Any]) -> None:
        """Log a comprehensive usage summary."""
        
        stats = TokenUsageTracker.get_session_stats(session_state)
        
        if stats["status"] == "no_data":
            logger.info("📊 No token usage data to report")
            return
        
        logger.info(
            "📊 TOKEN USAGE SUMMARY:\n"
            "  🕒 Session Duration: %.1f minutes\n"
            "  📝 Total Requests: %d\n"
            "  🔤 Input Tokens: %,d\n"
            "  💬 Output Tokens: %,d\n"  
            "  🔢 Total Tokens: %,d\n"
            "  📊 Avg Tokens/Request: %.1f\n"
            "  ⚡ Tokens/Minute: %.1f\n"
            "  💰 Estimated Cost: $%.6f (%.6f per request)",
            stats["session_duration_minutes"],
            stats["total_requests"],
            stats["input_tokens"],
            stats["output_tokens"],
            stats["total_tokens"],
            stats["average_tokens_per_request"],
            stats["tokens_per_minute"],
            stats["cost_estimation"]["total_cost_usd"],
            stats["cost_estimation"]["cost_per_request_usd"]
        )

def token_usage_tool(session_state: Dict[str, Any]) -> str:
    """Tool function that can be called to get current token usage stats."""
    stats = TokenUsageTracker.get_session_stats(session_state)
    
    if stats["status"] == "no_data":
        return "No token usage data available for this session."
    
    return f"""
📊 **Current Session Token Usage**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕒 Duration: {stats['session_duration_minutes']} minutes
📝 Requests: {stats['total_requests']}
🔤 Input Tokens: {stats['input_tokens']:,}
💬 Output Tokens: {stats['output_tokens']:,}
🔢 Total Tokens: {stats['total_tokens']:,}

📈 **Performance Metrics**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Avg Tokens/Request: {stats['average_tokens_per_request']}
⚡ Tokens/Minute: {stats['tokens_per_minute']:.1f}
🔄 Input/Output Ratio: {stats['input_output_ratio']}

💰 **Cost Estimation** ({stats['cost_estimation']['model']})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 Total Cost: ${stats['cost_estimation']['total_cost_usd']:.6f}
📊 Cost/Request: ${stats['cost_estimation']['cost_per_request_usd']:.6f}
"""