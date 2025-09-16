"""
Branch Repository for MAA Banking System
Handles all branch-related database operations
"""

import logging
from typing import Optional, List, Dict, Any
from .. import execute_query

logger = logging.getLogger(__name__)


class BranchRepository:
    """Repository class for branch operations"""
    
    def get_branch_by_location_code(self, location_code: str) -> Optional[Dict[str, Any]]:
        """
        Get branch information by location code
        
        Args:
            location_code: Branch location code (Brooklyn, Manhattan, Downtown)
            
        Returns:
            Branch dictionary or None if not found
        """
        try:
            branch = execute_query(
                "SELECT * FROM branches WHERE location_code = %s",
                (location_code,),
                fetch_one=True
            )
            
            if not branch:
                return None
            
            return {
                "name": branch['name'],
                "location_code": branch['location_code'],
                "address": branch['address'] or {},
                "phone": branch['phone_number'],
                "services": branch['services'] or [],
                "hours": branch['hours'] or {},
                "specialties": branch['specialties'] or []
            }
            
        except Exception as e:
            logger.error(f"Error getting branch by location {location_code}: {e}")
            return None
    
    def get_all_branches(self) -> List[Dict[str, Any]]:
        """
        Get information about all branches
        
        Returns:
            List of branch dictionaries
        """
        try:
            branches = execute_query("SELECT * FROM branches ORDER BY name")
            
            return [
                {
                    "name": branch['name'],
                    "location_code": branch['location_code'],
                    "address": branch['address'] or {},
                    "phone": branch['phone_number'],
                    "services": branch['services'] or [],
                    "hours": branch['hours'] or {},
                    "specialties": branch['specialties'] or []
                }
                for branch in (branches or [])
            ]
            
        except Exception as e:
            logger.error(f"Error getting all branches: {e}")
            return []
    
    def get_branch_info_formatted(self, location_code: Optional[str] = None) -> Dict[str, Any]:
        """
        Get formatted branch information for the agent
        
        Args:
            location_code: Optional specific branch location
            
        Returns:
            Formatted branch information dictionary
        """
        try:
            if location_code:
                branch = self.get_branch_by_location_code(location_code)
                if branch:
                    return {"branch_info": branch}
                else:
                    return {"error": f"Branch not found for location: {location_code}"}
            else:
                branches = self.get_all_branches()
                return {"branches": branches}
                
        except Exception as e:
            logger.error(f"Error getting formatted branch info: {e}")
            return {"error": "Failed to retrieve branch information"}


# Global instance
branch_repository = BranchRepository()
