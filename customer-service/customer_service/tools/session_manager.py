"""
Session management for MAA backend API authentication.
"""

import requests
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)


class MAASessionManager:
    """Manages authentication sessions with the MAA backend."""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.session = requests.Session()
        self._authenticated = False
        self._username = None
    
    def login(self, username: str = "Jack Rogers", password: str = "password123") -> bool:
        """
        Login to the MAA backend.
        
        Args:
            username: The username (default: Jack Rogers)
            password: The password (default: password123)
            
        Returns:
            bool: True if login successful, False otherwise
        """
        try:
            login_data = {
                "username": username,
                "password": password
            }
            
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json=login_data,
                timeout=30
            )
            
            if response.status_code == 200:
                self._authenticated = True
                self._username = username
                logger.info("Successfully logged into MAA backend as %s", username)
                return True
            else:
                logger.error("Login failed: %s - %s", response.status_code, response.text)
                return False
                
        except requests.RequestException as e:
            logger.error("Error during login: %s", str(e))
            return False
    
    def is_authenticated(self) -> bool:
        """Check if currently authenticated."""
        return self._authenticated
    
    def get_session(self) -> requests.Session:
        """Get the authenticated session."""
        return self.session
    
    def get_headers(self) -> Dict[str, str]:
        """Get headers for API requests."""
        return {
            'Content-Type': 'application/json'
        }
    
    def logout(self) -> bool:
        """Logout from the MAA backend."""
        try:
            if self._authenticated:
                response = self.session.post(
                    f"{self.base_url}/api/auth/logout",
                    timeout=30
                )
                
                if response.status_code == 200:
                    self._authenticated = False
                    self._username = None
                    logger.info("Successfully logged out from MAA backend")
                    return True
                else:
                    logger.warning("Logout response: %s - %s", response.status_code, response.text)
                    
            self._authenticated = False
            self._username = None
            return True
            
        except requests.RequestException as e:
            logger.error("Error during logout: %s", str(e))
            return False


# Global session manager instance
_session_manager: Optional[MAASessionManager] = None


def get_session_manager() -> MAASessionManager:
    """Get the global session manager instance."""
    global _session_manager
    if _session_manager is None:
        _session_manager = MAASessionManager()
    return _session_manager


def ensure_authenticated() -> bool:
    """Ensure we have an authenticated session with MAA backend."""
    session_mgr = get_session_manager()
    
    if not session_mgr.is_authenticated():
        logger.info("Not authenticated, attempting to login...")
        return session_mgr.login()
    
    return True
