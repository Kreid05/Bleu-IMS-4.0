import React from "react";
import "./EditEmployeeModal.css";

function EditEmployeeModal({ show, onClose, formData, onFormChange, onSave, editingEmployee }) {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2>{editingEmployee ? "Edit Employee" : "Add Employee"}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
            <label>Full Name<span className="required">*</span></label>
            <input type="text" name="name" placeholder="Full Name" value={formData.name} onChange={onFormChange} required/>
            <div className="row">
              <div><label>Email Address<span className="required">*</span></label><input type="email" name="email" placeholder="Email" value={formData.email} onChange={onFormChange} required/></div>
              <div><label>Phone Number</label><input type="tel" name="phone" placeholder="Phone Number" value={formData.phone} onChange={onFormChange}/></div>
            </div>
            <div className="row">
              <div>
                <label>Role<span className="required">*</span></label>
                <select name="role" value={formData.role} onChange={onFormChange} required>
                  <option value="">Select Role</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                  <option value="rider">Rider</option>
                  <option value="cashier">Cashier</option>
                  <option value="super admin">Super Admin</option>
                </select>
              </div>
              <div>
                <label>System<span className="required">*</span></label>
                <select name="system" value={formData.system} onChange={onFormChange} required>
                  <option value="">Select System</option>
                  <option value="IMS">IMS</option>
                  <option value="POS">POS</option>
                  <option value="OOS">OOS</option>
                  <option value="AUTH">AUTH</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div>
                <label>Username{!editingEmployee && <span className="required">*</span>}</label>
                <input 
                  type="text" 
                  name="username" 
                  placeholder="Username" 
                  value={formData.username} 
                  onChange={onFormChange} 
                  required={!editingEmployee}
                  disabled={!!editingEmployee} 
                />
              </div>
              <div>
                <label>Password{!editingEmployee && <span className="required">*</span>}</label>
                <input 
                  type="password" 
                  name="password" 
                  placeholder={editingEmployee ? "Leave blank to keep unchanged" : "Password"} 
                  value={formData.password} 
                  onChange={onFormChange}
                  required={!editingEmployee}
                />
              </div>
            </div>
            <button type="submit" className="save-btn">Save Employee</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EditEmployeeModal;
