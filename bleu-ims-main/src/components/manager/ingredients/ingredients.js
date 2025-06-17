import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import "./ingredients.css";
import Sidebar from "../../sidebar";
import { FaChevronDown, FaFolderOpen, FaEdit, FaArchive } from "react-icons/fa";
import DataTable from "react-data-table-component";
import AddIngredientModal from './modals/addIngredientModal';
import EditIngredientModal from './modals/editIngredientModal';
import ViewIngredientModal from './modals/viewIngredientModal';
import Header from "../../header";

const API_BASE_URL = "http://127.0.0.1:8002";
const getAuthToken = () => localStorage.getItem("access_token");
const DEFAULT_PROFILE_IMAGE = "https://media-hosting.imagekit.io/1123dd6cf5c544aa/screenshot_1746457481487.png?Expires=1841065483&Key-Pair-Id=K2ZIVPTIP2VGHC&Signature=kiHcXbHpirt9QHbMA4by~Kd4b2BrczywyVUfZZpks5ga3tnO8KlP8s5tdDpZQqinqOG30tGn0tgSCwVausjJ1OJ9~e6qPVjLXbglD-65hmsehYCZgEzeyGPPE-rOlyGJCgJC~GCZOu0jDKKcu2fefrClaqBBT3jaXoK4qhDPfjIFa2GCMfetybNs0RF8BtyKLgFGeEkvibaXhYxmzO8tksUKaLAMLbsPWvHBNuzV6Ar3mj~lllq7r7nrynNfdvbtuED7OGczSqZ8H-iopheAUhaWZftAh9tX2vYZCZZ8UztSEO3XUgLxMMtv9NnTei1omK00iJv1fgBjwR2lSqRk7w__";

function Ingredients() {
    const [isDropdownOpen, setDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('nameAsc');
    const [statusFilter, setStatusFilter] = useState('all');
    const [ingredients, setIngredients] = useState([]);
    const navigate = useNavigate();
    const toggleDropdown = () => setDropdownOpen(!isDropdownOpen);
    const [loggedInUserDisplay, setLoggedInUserDisplay] = useState({ role: "User", name: "Current User" });

    const [showAddIngredientModal, setShowAddIngredientModal] = useState(false);
    const [showEditIngredientModal, setShowEditIngredientModal] = useState(false);
    const [currentIngredient, setCurrentIngredient] = useState(null);
    const [showViewIngredientModal, setShowViewIngredientModal] = useState(false);

    const filteredIngredients = ingredients
        .filter(ingredient => {
            const matchesSearch = ingredient.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'all' || ingredient.Status === statusFilter;
            return matchesSearch && matchesStatus;
        })
        .sort((a, b) => {
            if (sortOrder === 'nameAsc') {
                return a.name.localeCompare(b.name);
            } else {
                return b.name.localeCompare(a.name);
            }
        });

    const currentDate = new Date().toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric",
    });

    useEffect(() => {
        const token = getAuthToken();
        if (token) {
            try {
                const decodedToken = JSON.parse(atob(token.split('.')[1]));
                setLoggedInUserDisplay({
                    name: decodedToken.sub || "Current User",
                    role: decodedToken.role || "User"
                });
            } catch (error) {
                console.error("Error decoding token for display:", error);
            }
        }
    }, []);

    useEffect(() => {
        fetchIngredients();
    }, []);

    const fetchIngredients = async () => {
        const token = getAuthToken();
        if (!token) {
            alert("Authentication token not found.");
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/ingredients/ingredients/`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch ingredients.");
            }

            const data = await response.json();

            const formattedData = data.map((item) => ({
                id: item.IngredientID,
                name: item.IngredientName,
                amount: item.Amount,
                measurement: item.Measurement,
                bestBefore: item.BestBeforeDate,
                expiration: item.ExpirationDate,
                status: item.Status,
            }));

            setIngredients(formattedData);
        } catch (error) {
            console.error("Error fetching ingredients:", error);
            alert("Session expired or unauthorized. Please login again.");
        }
    };

    const handleView = (ingredient) => {
        setCurrentIngredient(ingredient);
        setShowViewIngredientModal(true);
    };

    const handleEdit = (ingredient) => {
        setCurrentIngredient(ingredient);
        setShowEditIngredientModal(true);
    };

    const handleDelete = async (ingredientIdToDelete) => {

        const confirmDelete = window.confirm("Are you sure you want to delete this ingredient?");
        if (!confirmDelete) return;

        try {
            const response = await fetch(`${API_BASE_URL}/ingredients/ingredients/${ingredientIdToDelete}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${getAuthToken()}` },
            });

            if (!response.ok) throw new Error("Failed to delete ingredient.");

            setIngredients((prev) => prev.filter((ingredient) => ingredient.id !== ingredientIdToDelete));
        } catch (error) {
            console.error("Error deleting ingredient:", error);
            alert("Failed to delete ingredient.");
        }
    };

    const columns = [
        { name: "NO.", selector: (row, index) => index + 1, width: "5%" },
        { name: "INGREDIENT NAME", selector: (row) => row.name, sortable: true, width: "20%" },
        { name: "AMOUNT", selector: (row) => row.amount, width: "10%", center: true },
        { name: "UNIT", selector: (row) => row.measurement, width: "10%", center: true },
        { name: "BEST BEFORE DATE", selector: (row) => row.bestBefore, width: "15%", center: true },
        { name: "EXPIRATION DATE", selector: (row) => row.expiration, width: "15%", center: true },
        { 
            name: "STATUS", 
            selector: (row) => row.status, 
            width: "10%", 
            center: true,
            cell: (row) => {
                let className = "";
                if (row.status === "Available") className = "status-available";
                else if (row.status === "Low Stock") className = "status-low-stock";
                else if (row.status === "Not Available") className = "status-not-available";
                else className = ""; // fallback style if needed

                return <span className={className}>{row.status}</span>;
            }
        },
        {
            name: "ACTIONS",
            cell: (row) => (
                <div className="action-buttons">
                    <button className="action-button view" onClick={() => handleView(row)}><FaFolderOpen /></button>
                    <button className="action-button edit" onClick={() => handleEdit(row)}><FaEdit /></button>
                    <button className="action-button delete" onClick={() => handleDelete(row.id)}><FaArchive /></button>
                </div>
            ),
            ignoreRowClick: true,
            allowOverflow: true,
            width: "15%",
            center: true,
        },
    ];

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        navigate('/');
    };

    return (
        <div className="ingredients">
            <Sidebar />
            <div className="roles">

                <Header pageTitle="Ingredients" />

                <div className="ingredient-header">
                    <div className="ingredient-bottom-row">
                        <input
                            type="text"
                            className="ingredient-search-box"
                            placeholder="Search ingredients..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <div className="filter-ingredient-container">
                            <label htmlFor="filter-ingredient">Filter by Status:</label>
                            <select 
                                id="filter-ingredient" 
                                className="filter-ingredient-select"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">All</option>
                                <option value="Available">Available</option>
                                <option value="Low Stock">Low Stock</option>
                                <option value="Not Available">Not Available</option>
                            </select>
                        </div>

                        <div className="sort-ingredient-container">
                            <label htmlFor="sort-ingredient">Sort by:</label>
                            <select 
                                id="sort-ingredient" 
                                className="sort-ingredient-select"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                            >
                                <option value="nameAsc">Newest</option>
                                <option value="nameDesc">Oldest</option>
                            </select>
                        </div>

                        <button
                            className="add-ingredient-button"
                            onClick={() => setShowAddIngredientModal(true)}
                        >
                            + Add Ingredient
                        </button>
                    </div>
                </div>

                <div className="ingredient-content">
                    <DataTable
                        columns={columns}
                        data={filteredIngredients}
                        striped
                        highlightOnHover
                        responsive
                        pagination
                        customStyles={{
                            headCells: {
                                style: {
                                    backgroundColor: "#4B929D",
                                    color: "#fff",
                                    fontWeight: "600",
                                    fontSize: "14px",
                                    padding: "12px",
                                    textTransform: "uppercase",
                                    letterSpacing: "1px",
                                },
                            },
                            rows: {
                                style: {
                                    minHeight: "55px",
                                },
                            },
                        }}
                    />
                </div>
            </div>

            {showViewIngredientModal && currentIngredient && (
                <ViewIngredientModal
                    ingredient={currentIngredient}
                    onClose={() => setShowViewIngredientModal(false)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                />
            )}

            {showAddIngredientModal && (
                <AddIngredientModal 
                    onClose={() => setShowAddIngredientModal(false)} 
                    onSubmit={(newIngredient) => {
                        setShowAddIngredientModal(false);
                        fetchIngredients();
                    }}
                />
            )}

            {showEditIngredientModal && currentIngredient && (
                <EditIngredientModal
                    ingredient={currentIngredient}
                    onClose={() => setShowEditIngredientModal(false)}
                    onUpdate={() => {
                        setCurrentIngredient(null);
                        fetchIngredients();
                    }}
                />
            )}

        </div>
    );
}

export default Ingredients;
