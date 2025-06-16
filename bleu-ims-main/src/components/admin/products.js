import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from 'react-router-dom';
import "../admin/products.css"; 
import Sidebar from "../sidebar"; 
import { FaChevronDown, FaFolderOpen, FaEdit, FaArchive, FaPlusSquare } from "react-icons/fa";
import DataTable from "react-data-table-component";
import ProductTypeModal from './modals/productTypeModal';
import AddProductModal from './modals/addModals/addProductModal';
import EditProductModal from './modals/editModals/editProductModal';
import ViewProductModal from './modals/viewModals/viewProductModal';
import AddSizeModal from './modals/addModals/addSizeModal';

const API_BASE_URL = "http://127.0.0.1:8001";
const getAuthToken = () => localStorage.getItem("access_token");
const DEFAULT_PROFILE_IMAGE = "https://media-hosting.imagekit.io/1123dd6cf5c544aa/screenshot_1746457481487.png?Expires=1841065483&Key-Pair-Id=K2ZIVPTIP2VGHC&Signature=kiHcXbHpirt9QHbMA4by~Kd4b2BrczywyVUfZZpks5ga3tnO8KlP8s5tdDpZQqinqOG30tGn0tgSCwVausjJ1OJ9~e6qPVjLXbglD-65hmsehYCZgEzeyGPPE-rOlyGJCgJC~GCZOu0jDKKcu2fefrClaqBBT3jaXoK4qhDPfjIFa2GCMfetybNs0RF8BtyKLgFGeEkvibaXhYxmzO8tksUKaLAMLbsPWvHBNuzV6Ar3mj~lllq7r7nrynNfdvbtuED7OGczSqZ8H-iopheAUhaWZftAh9tX2vYZCZZ8UztSEO3XUgLxMMtv9NnTei1omK00iJv1fgBjwR2lSqRk7w__";

function Products() {
  const currentDate = new Date().toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });

  const navigate = useNavigate();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [products, setProducts] = useState([]); 
  const [showProductTypeModal, setShowProductTypeModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [viewedProduct, setViewedProduct] = useState(null);
  const [editModalData, setEditModalData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("nameAsc");
  const [loggedInUserDisplay, setLoggedInUserDisplay] = useState({ role: "User", name: "Current User" });
  const [showAddSizeModal, setShowAddSizeModal] = useState(false);
  const [productForSizeAddition, setProductForSizeAddition] = useState(null);

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

  const toggleDropdown = () => setDropdownOpen(!isDropdownOpen);
  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const handleSortChange = (e) => setSortOption(e.target.value);

  const sortProducts = (list) => {
    if (!Array.isArray(list) || list.some(item => typeof item.ProductName !== 'string')) {
        return list;
    }
    if (sortOption === "nameAsc") {
      return [...list].sort((a, b) => a.ProductName.localeCompare(b.ProductName));
    } else if (sortOption === "nameDesc") {
      return [...list].sort((a, b) => b.ProductName.localeCompare(a.ProductName));
    }
    return list;
  };

  const fetchProductTypes = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/ProductType/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to fetch product types: ${response.status} ${errorData}`);
      }
      const data = await response.json();
      setProductTypes(data); 
      if (data.length > 0 && activeTab === null) {
        setActiveTab(data[0].productTypeID);
      }
    } catch (error) {
      console.error("Failed to fetch product types:", error);
    }
  }, [activeTab]);

  const fetchProducts = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/is_products/products/ `, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to fetch products: ${response.status} ${errorData}`);
      }
      const data = await response.json(); 
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  }, []);

  useEffect(() => {
    fetchProductTypes();
    fetchProducts();
  }, [fetchProductTypes, fetchProducts]);

  const handleView = (product) => setViewedProduct(product);

  const handleEdit = (product) => {
    setEditModalData({
      productID: product.ProductID,
      productTypeID: product.ProductTypeID,
      productName: product.ProductName,
      productCategory: product.ProductCategory,
      productDescription: product.ProductDescription,
      productPrice: product.ProductPrice,
      productImage: product.ProductImage,
      productSize: product.ProductSizes && product.ProductSizes.length > 0 ? product.ProductSizes[0] : "",
    });
    setShowEditProductModal(true);
  };

  const handleUpdateProduct = (updatedProductFromModal) => {
    setProducts((prevProducts) =>
      prevProducts.map((p) => (p.ProductID === updatedProductFromModal.ProductID ? updatedProductFromModal : p))
    );
    setShowEditProductModal(false);
    setEditModalData(null);
  };

  const handleProductAdded = (newProductFromModal) => {
    setProducts((prevProducts) => [...prevProducts, newProductFromModal]);
    setShowAddProductModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    const token = getAuthToken();
    if (!token) {
        alert("Authentication token not found.");
        return;
    }
    fetch(`${API_BASE_URL}/products/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
            const errorData = await res.text();
            throw new Error(`Delete failed: ${res.status}. ${errorData}`);
        }
        setProducts((prev) => prev.filter((p) => p.ProductID !== id));
      })
      .catch((err) => {
        console.error("Error deleting product:", err);
        alert(`An error occurred: ${err.message}. Refreshing data.`);
        fetchProducts();
      });
  };

  const handleOpenAddSizeModal = (product) => {
    setProductForSizeAddition(product);
    setShowAddSizeModal(true);
  };

  const handleSizeAdded = (productId, newSizeData) => {
    fetchProducts(); 
    setShowAddSizeModal(false);
    setProductForSizeAddition(null);
    alert(`Size '${newSizeData.SizeName}' added to product ID ${productId}.`);
  };


  const columns = [
    { name: "NO.", selector: (row, i) => i + 1, width: "5%", center: true },
    {
      name: "IMAGE",
      cell: (row) => {
        const imageUrl = row.ProductImage
            ? `${API_BASE_URL}${row.ProductImage}`
            : DEFAULT_PROFILE_IMAGE;
        return (
            <img
                src={imageUrl}
                alt={row.ProductName}
                className="product-photo"
                onError={(e) => {
                    console.warn(`Error loading image: ${imageUrl}. Product: ${row.ProductName}. Falling back to default.`);
                    e.target.onerror = null;
                    e.target.src = DEFAULT_PROFILE_IMAGE;
                }}
                style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4 }}
            />
        );
      },
      width: "12%", center: true, ignoreRowClick: true, allowOverflow: true,
    },
    { name: "NAME", selector: (row) => row.ProductName, wrap: true, width: "15%" },
    {
      name: "SIZE",
      selector: (row) =>
        row.ProductSizes && row.ProductSizes.length > 0
          ? row.ProductSizes.join(", ")
          : "N/A",
      width: "10%", center: true, wrap: true,
    },
    { name: "DESCRIPTION", selector: (row) => row.ProductDescription, wrap: true, center: true, width: "17%" },
    { name: "CATEGORY", selector: (row) => row.ProductCategory, wrap: true, center: true, width: "14%" },
    {
      name: "PRICE",
      selector: (row) => `₱${parseFloat(row.ProductPrice).toFixed(2)}`,
      sortable: true, center: true, wrap: true, width: "10%",
    },
    {
      name: "ACTIONS",
      cell: (row) => (
        <div className="action-buttons">
          <button className="action-button view" title="View Product" onClick={() => handleView(row)}><FaFolderOpen /></button>
          <button className="action-button edit" title="Edit Product" onClick={() => handleEdit(row)}><FaEdit /></button>
          <button className="action-button delete" title="Delete Product" onClick={() => handleDelete(row.ProductID)}><FaArchive /></button>
        </div>
      ),
      ignoreRowClick: true, width: "18%", center: true,
    },
  ];

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const filteredProducts = sortProducts(
    products.filter(product =>
      product &&
      (activeTab === null || product.ProductTypeID === activeTab) && 
      (product.ProductName && product.ProductName.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  return (
    <div className="products">
      <Sidebar />
      <div className="roles">
        <header className="header">
          <div className="header-left">
            <h2 className="page-title">Product Management</h2>
          </div>
          <div className="header-right">
            <div className="header-date">{currentDate}</div>
            <div className="header-profile">
              <div className="profile-pic" />
              <div className="profile-info">
                <div className="profile-role">Hi! I'm {loggedInUserDisplay.role}</div>
                <div className="profile-name">{loggedInUserDisplay.name}</div>
              </div>
              <div className="dropdown-icon" onClick={toggleDropdown} style={{ cursor: 'pointer' }}><FaChevronDown /></div>
              {isDropdownOpen && (
                <div className="profile-dropdown">
                  <ul>
                    <li onClick={handleLogout}>Logout</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="product-header">
          <div className="product-top-row">
            {productTypes.map((type) => ( 
              <button
                key={type.productTypeID}
                className={`product-tab-button ${activeTab === type.productTypeID ? "active" : ""}`}
                onClick={() => setActiveTab(type.productTypeID)}
              >
                {type.productTypeName}
              </button>
            ))}
          </div>

          <div className="product-bottom-row">
            <input
              type="text"
              className="product-search-box"
              placeholder="Search products..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <div className="sort-product-container">
              <label htmlFor="sort-product">Sort by:</label>
              <select
                id="sort-product"
                className="sort-product-select"
                value={sortOption}
                onChange={handleSortChange}
              >
                <option value="nameAsc">Name A-Z</option>
                <option value="nameDesc">Name Z-A</option>
              </select>
            </div>
            <button className="add-product-button" onClick={() => setShowAddProductModal(true)}>+ Add Product</button>
            <button className="product-type-button" onClick={() => setShowProductTypeModal(true)}>Product Type</button>
          </div>
        </div>

        <div className="products-content">
          <DataTable
            columns={columns}
            data={filteredProducts}
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
                  textAlign: "center",
                  letterSpacing: "1px",
                },
              },
              rows: { style: { minHeight: "72px", alignItems: 'center' } },
              cells: { style: { paddingLeft: '16px', paddingRight: '16px', textAlign: 'left' } },
            }}
            noDataComponent={<div>No products found.</div>}
            paginationComponentOptions={{
                rowsPerPageText: 'Rows per page:',
                rangeSeparatorText: 'of',
                selectAllRowsItem: true,
                selectAllRowsItemText: 'All',
            }}
          />
        </div>
      </div>

      {viewedProduct && (
        <ViewProductModal
          product={viewedProduct} 
          imageBaseUrl={API_BASE_URL}
          onClose={() => setViewedProduct(null)}
          onEdit={handleEdit}
          onDelete={(id) => {
            handleDelete(id);
            setViewedProduct(null);
          }}
        />
      )}

      {showProductTypeModal && (
        <ProductTypeModal 
          onClose={() => setShowProductTypeModal(false)}
          onProductTypeAdded={() => {
            fetchProductTypes(); 
            setShowProductTypeModal(false);
          }}
        />
      )}

      {showAddProductModal && (
        <AddProductModal
          productTypes={productTypes} 
          onClose={() => setShowAddProductModal(false)}
          onSubmit={(newProduct) => setProducts((prev) => [...prev, newProduct])}
          onProductAdded={handleProductAdded}
        />
      )}

      {showEditProductModal && editModalData && (
        <EditProductModal
          product={editModalData} 
          productTypes={productTypes} 
          onClose={() => {
            setShowEditProductModal(false);
            setEditModalData(null);
          }}
          onUpdate={handleUpdateProduct}
        />
      )}

      {showAddSizeModal && productForSizeAddition && (
        <AddSizeModal
          product={productForSizeAddition} 
          onClose={() => {
            setShowAddSizeModal(false);
            setProductForSizeAddition(null);
          }}
          onSizeAdded={handleSizeAdded}
        />
      )}
    </div>
  );
}

export default Products;