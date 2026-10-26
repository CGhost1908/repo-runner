import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.jsx";
import { Home } from "./pages/Home.jsx";
import { Runner } from "./pages/Runner.jsx";
import { Projects } from "./pages/Projects.jsx";
import { ProjectDetail } from "./pages/ProjectDetail.jsx";
import { ActivePorts } from "./pages/ActivePorts.jsx";
import { Settings } from "./pages/Settings.jsx";
import { NotFound } from "./pages/NotFound.jsx";

export default function App() {
  const [toastMessage, setToastMessage] = useState(null);
  const [isLive, setIsLive] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const toast = {
    message: toastMessage,
    show: showToast
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout toast={toast} isLive={isLive} />}>
          <Route index element={<Home />} />
          <Route path="runner" element={<Runner setIsLive={setIsLive} />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="ports" element={<ActivePorts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
