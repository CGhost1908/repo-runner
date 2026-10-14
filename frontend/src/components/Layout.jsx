import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar.jsx";
import { Topbar } from "./Topbar.jsx";
import { UserProfileModal } from "./UserProfileModal.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";

export function Layout({ toast, isLive }) {
  const [projectCount, setProjectCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("repo_runner_profile") || '{"name":"Eren","role":"Project Administrator"}');
    } catch {
      return { name: "Eren", role: "Project Administrator" };
    }
  });

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/system/stats");
      if (res.ok) {
        const data = await res.json();
        setProjectCount(data.saved_projects_count || 0);
        setIsOnline(true);
      } else {
        setIsOnline(false);
      }
    } catch {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveProfile = (newProfile) => {
    setUserProfile(newProfile);
    localStorage.setItem("repo_runner_profile", JSON.stringify(newProfile));
    toast.show("Profile details updated.");
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to sign out and reset your profile?")) {
      const defaultProf = { name: "Eren", role: "Developer" };
      setUserProfile(defaultProf);
      localStorage.removeItem("repo_runner_profile");
      toast.show("Session reset.");
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        projectCount={projectCount}
        isLive={isLive}
        userProfile={userProfile}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onLogout={handleLogout}
      />

      <div className="main-wrapper">
        <Topbar isOnline={isOnline} />

        <main className="content-container">
          <ErrorBoundary>
            <Outlet context={{ toast, onRefreshStats: fetchStats }} />
          </ErrorBoundary>
        </main>
      </div>

      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userProfile={userProfile}
        onSave={handleSaveProfile}
      />

      {toast.message && (
        <div className="toast">
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
