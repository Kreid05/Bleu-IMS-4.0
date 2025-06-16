import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./usermanagement.css";
import Sidebar from "./sidebar";
import {
  FaChevronDown,
  FaBell,
  FaEdit,
  FaArchive,
  FaPlus,
  FaFolderOpen,
} from "react-icons/fa";
import DataTable from "react-data-table-component";
import EditEmployeeModal from "./modals/editModals/EditEmployeeModal";
import ViewEmployeeModal from "./modals/viewModals/ViewEmployeeModal";

function Usermanagement() {
  // --- STATE MANAGEMENT ---
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [activeTab, setActiveTab] = useState("employees");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const initialFormData = {
    id: null,
    name: "",
    username: "",
    email: "",
    phone: "",
    role: "",
    system: "",
    status: "Active",
    password: "",
  };
  const [formData, setFormData] = useState(initialFormData);
  
  const getAuthToken = () => localStorage.getItem("authToken");

  // --- CONNECTION: Fetching data from the API ---
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchEmployees = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("http://127.0.0.1:4000/users/list-users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`);
        
        let apiData = await response.json();
        if (apiData && !Array.isArray(apiData)) apiData = [apiData];
        else if (!apiData) apiData = [];

        const mappedEmployees = apiData.map((user) => ({
          id: user.userID,
          name: user.fullName,
          username: user.username,
          email: user.email,
          role: user.userRole,
          system: user.system || "N/A",
          status: user.isDisabled ? "Inactive" : "Active",
          phone: user.phoneNumber || "N/A",
        }));

        setEmployees(mappedEmployees);

      } catch (e) {
        console.error("Fetch error:", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, [navigate]);

  const toggleDropdown = () => setDropdownOpen(!isDropdownOpen);
  const currentDate = new Date().toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  });
  const [loggedInUserDisplay] = useState({ role: "Admin", name: "Current User" });

  const handleModalClose = () => {
    setShowModal(false);
    setEditingEmployee(null);
    setFormData(initialFormData);
  };

  // --- CONNECTION: handleSaveEmployee sends data to the backend ---
  const handleSaveEmployee = async () => {
    // Universal validation, no longer role-specific
    const isEditing = !!editingEmployee;
    if (!isEditing && !formData.username) {
        alert("Username is required for new employees.");
        return;
    }
    if (!isEditing && !formData.password) {
        alert("Password is required for new employees.");
        return;
    }

    const token = getAuthToken();
    if (!token) { alert("Authentication error."); navigate('/login'); return; }
    
    const formDataPayload = new FormData();

    formDataPayload.append('fullName', formData.name);
    formDataPayload.append('email', formData.email);
    
    if (formData.phone) {
        formDataPayload.append('phoneNumber', formData.phone);
    }
    
    if (isEditing) {
        // When editing, only send the password if the user has entered a new one.
        // Do not send the username, as it cannot be changed.
        if (formData.password) {
            formDataPayload.append('password', formData.password);
        }
    } else {
        // When creating, all these fields are required by the backend.
        formDataPayload.append('username', formData.username);
        formDataPayload.append('password', formData.password);
        formDataPayload.append('userRole', formData.role);
        formDataPayload.append('system', formData.system);
    }

    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing 
      ? `http://127.0.0.1:4000/users/update/${editingEmployee.id}` 
      : 'http://127.0.0.1:4000/users/create';

    try {
      const response = await fetch(url, {
        method, 
        headers: { 
          'Authorization': `Bearer ${token}` 
        }, 
        body: formDataPayload
      });
      if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Failed to save employee');
      }
      alert(`Employee ${isEditing ? "updated" : "added"} successfully!`);
      handleModalClose();
      window.location.reload(); 
    } catch(err) { 
        console.error("Save error:", err); 
        alert(err.message); 
    }
  };

  const handleViewEmployee = (emp) => {
    setViewingEmployee(emp);
  };

  const handleEditEmployee = (emp) => {
    setEditingEmployee(emp);
    setFormData({
      id: emp.id,
      name: emp.name,
      username: emp.username, // Username is always available now
      email: emp.email,
      phone: emp.phone === "N/A" ? "" : emp.phone,
      role: emp.role,
      system: emp.system,
      status: emp.status,
      password: "",
    });
    setShowModal(true);
  };

  const handleDeleteEmployee = async (empId) => {
    if (!window.confirm("Are you sure you want to archive this employee? This will set their status to Inactive.")) return;
    const token = getAuthToken();
    
    const url = `http://127.0.0.1:4000/users/disable/${empId}`; 
    try {
        const response = await fetch(url, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }});
        if (!response.ok) throw new Error('Failed to archive employee');
        setEmployees(prev => prev.map(emp => emp.id === empId ? { ...emp, status: 'Inactive' } : emp));
        alert("Employee archived successfully!");
    } catch (err) { console.error("Archive error:", err); alert(err.message); }
  };
  
  const filteredData = employees.filter((emp) => {
    const nameMatch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = emp.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const roleMatch = roleFilter ? emp.role === roleFilter : true;
    const statusMatch = statusFilter ? emp.status === statusFilter : true;
    return (nameMatch || emailMatch) && roleMatch && statusMatch;
  });

  const columns = [
    { name: "EMPLOYEE", selector: (row) => row.name, sortable: true, width: "20%",},
    { name: "EMAIL", selector: (row) => row.email, sortable: false, width: "25%",},
    { name: "ROLE", selector: (row) => row.role, sortable: false, width: "15%",},
    { name: "PHONE", selector: (row) => row.phone, width: "10%" },
    { name: "STATUS", selector: (row) => (<span className={`status-badge ${row.status === "Active" ? "active" : "inactive"}`}>{row.status}</span>), width: "10%",},
    { name: "System", selector: (row) => row.system, width: "10%" },
    { name: "ACTION", cell: (row) => (<div className="action-buttons"><button className="view-button" onClick={() => handleViewEmployee(row)}><FaFolderOpen /></button><button className="edit-button" onClick={() => handleEditEmployee(row)}><FaEdit /></button><button className="delete-button" onClick={() => handleDeleteEmployee(row.id)}><FaArchive /></button></div>), width: "10%",},
  ];

  // THE FIX: Removed special logic for cashier passcode
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    navigate("/");
  };

  const [roles] = useState([{ id: 1, name: "Admin", description: "Full system access", users: 1 }, { id: 2, name: "Manager", description: "Store management", users: 3 }, { id: 3, name: "Cashier", description: "Point of sale functions", users: 5 }]);
  const columnRoles = [{ name: "ROLE NAME", selector: (row) => row.name, sortable: true, width: "33%" }, { name: "DESCRIPTION", selector: (row) => row.description, wrap: true, width: "34%" }, { name: "USERS", selector: (row) => row.users, center: true, width: "33%" }];

  return (
    <div className="empRecords">
      <Sidebar />
      <div className="employees">
        <header className="header">
          <div className="header-left"><h2 className="page-title">User management</h2></div>
          <div className="header-right">
            <div className="header-date">{currentDate}</div>
            <div className="header-profile">
              <div className="profile-left">
                <div className="profile-info">
                  <div className="profile-role">Hi! I'm {loggedInUserDisplay.role}</div>
                  <div className="profile-name">{loggedInUserDisplay.name}</div>
                </div>
              </div>
              <div className="profile-right">
                <div className="dropdown-icon" onClick={toggleDropdown}><FaChevronDown /></div>
                <div className="bell-icon"><FaBell className="bell-outline" /></div>
              </div>
              {isDropdownOpen && (<div className="profile-dropdown"><ul><li onClick={handleLogout}>Logout</li></ul></div>)}
            </div>
          </div>
        </header>

        <div className="empRecords-content">
          <div className="tabs">
            <button className={activeTab === "employees" ? "tab active-tab" : "tab"} onClick={() => setActiveTab("employees")}>Employees</button>
            <button className={activeTab === "roles" ? "tab active-tab" : "tab"} onClick={() => setActiveTab("roles")}>Roles</button>
          </div>

          {activeTab === "employees" && (
            <>
              <div className="filter-bar">
                <input type="text" placeholder="Search Employees..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="">Role: All</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                  <option value="rider">Rider</option>
                  <option value="cashier">Cashier</option>
                  <option value="super admin">Super Admin</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Status: All</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
                </select>
                <button className="add-btn" onClick={() => { setEditingEmployee(null); setFormData(initialFormData); setShowModal(true); }}>
                  <FaPlus /> Add Employee
                </button>
              </div>

              <EditEmployeeModal
                show={showModal}
                onClose={handleModalClose}
                formData={formData}
                onFormChange={handleFormChange}
                onSave={handleSaveEmployee}
                editingEmployee={editingEmployee}
              />

              <ViewEmployeeModal
                show={!!viewingEmployee}
                onClose={() => setViewingEmployee(null)}
                viewingEmployee={viewingEmployee}
              />

              <DataTable
                columns={columns}
                data={filteredData}
                pagination
                highlightOnHover
                responsive
                progressPending={loading}
                noDataComponent={ <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}> {error ? `Error: ${error}` : 'No employee records found.'} </div> }
                customStyles={{
                  headCells: { style: { backgroundColor: "#4B929D", color: "#fff", fontWeight: "600", fontSize: "14px", padding: "12px", textTransform: "uppercase", textAlign: "center", letterSpacing: "1px"}},
                  header: { style: { minHeight: "60px", paddingTop: "10px", paddingBottom: "10px"}},
                  rows: { style: { minHeight: "55px", padding: "5px" } },
                }}
              />
            </>
          )}

          {activeTab === "roles" && (
            <div className="roleManagement"><div className="roles"><div className="roleManagement-content">
              <DataTable columns={columnRoles} data={roles} striped highlightOnHover responsive pagination
                customStyles={{
                  headCells: { style: { backgroundColor: "#4B929D", color: "#fff", fontWeight: "600", fontSize: "14px", padding: "12px", textTransform: "uppercase", textAlign: "center", letterSpacing: "1px"}},
                  rows: { style: { minHeight: "55px", padding: "5px"}},
                }}
              />
            </div></div></div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Usermanagement;
