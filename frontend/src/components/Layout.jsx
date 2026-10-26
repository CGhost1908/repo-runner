import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar.jsx";
import { Topbar } from "./Topbar.jsx";
import { UserProfileModal } from "./UserProfileModal.jsx";
import { ActiveInstancesModal } from "./ActiveInstancesModal.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";

export function Layout({ toast, isLive }) {
  const [projectCount, setProjectCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPortsModalOpen, setIsPortsModalOpen] = useState(false);
  const [portsData, setPortsData] = useState({
    ports: [],
    running_repos: [],
    running_repos_count: 0,
    active_ports_count: 0,
    suggested_free_port: 8000
  });
  const [freeingPortNum, setFreeingPortNum] = useState(null);

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

  const fetchPorts = async () => {
    try {
      const res = await fetch("/api/ports");
      if (res.ok) {
        const data = await res.json();
        setPortsData(data);
      }
    } catch (_) {}
  };

  const handleGlobalFreePort = async (portNum) => {
    setFreeingPortNum(portNum);
    try {
      const res = await fetch(`/api/ports/free/${portNum}`, { method: "POST" });
      if (res.ok) {
        toast.show(`Port ${portNum} released successfully.`);
        await Promise.all([fetchPorts(), fetchStats()]);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.show(err.detail || `Could not free port ${portNum}.`);
      }
    } catch (_) {
      toast.show(`Failed to free port ${portNum}.`);
    } finally {
      setFreeingPortNum(null);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchPorts();
    const interval = setInterval(() => {
      fetchStats();
      fetchPorts();
    }, 4000);
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
        activePortsCount={portsData.active_ports_count || 0}
        runningReposCount={portsData.running_repos_count || 0}
        isLive={isLive || (portsData.running_repos_count || 0) > 0}
        userProfile={userProfile}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onLogout={handleLogout}
      />

      <div className="main-wrapper">
        <Topbar
          isOnline={isOnline}
          portsData={portsData}
          onOpenPortsModal={() => {
            fetchPorts();
            setIsPortsModalOpen(true);
          }}
        />

        <main className="content-container">
          <ErrorBoundary>
            <Outlet
              context={{
                toast,
                onRefreshStats: fetchStats,
                portsData,
                onRefreshPorts: fetchPorts,
                onFreePort: handleGlobalFreePort,
                freeingPortNum,
                onOpenPortsModal: () => setIsPortsModalOpen(true)
              }}
            />
          </ErrorBoundary>
        </main>
      </div>

      <ActiveInstancesModal
        isOpen={isPortsModalOpen}
        onClose={() => setIsPortsModalOpen(false)}
        portsData={portsData}
        onRefresh={fetchPorts}
        onFreePort={handleGlobalFreePort}
        freeingPortNum={freeingPortNum}
      />

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
