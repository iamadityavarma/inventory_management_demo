import React, { useState, useEffect } from 'react';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig';
import { inventoryItems as mockItems } from './data/mockData';
import { filterInventoryItems, calculateMetrics } from './utils/inventoryHelpers';
// Preloaded data functions have been removed along with caching
import Header from './components/Header';
import KeyMetrics from './components/KeyMetrics';
import Filters from './components/Filters';
import TabNavigation from './components/TabNavigation';
import InventoryTable from './components/InventoryTable';
import ItemDetailModal from './components/ItemDetailModal';
import CartModal from './components/CartModal';
// Re-import AdvancedFiltersModal with explicit path
import AdvancedFiltersModal from './components/AdvancedFiltersModal.js';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import FilterSummaryDisplay from './components/FilterSummaryDisplay'; // Import the new component
import CartReviewModal from './components/CartReviewModal'; // Import CartReviewModal
import Sidebar from './components/Sidebar'; // <-- Add new import
import OrderRequestsPage from './pages/OrderRequestsPage'; // <-- Add new import
import TransferRequestsPage from './pages/TransferRequestsPage'; // <-- Add new import

// API base URL - supports both local dev and Azure deployments
// First try window.API_BASE_URL (from env-config.js), then process.env, then localhost
const API_BASE_URL = window.API_BASE_URL || process.env.REACT_APP_API_URL || 'http://localhost:8000';
console.log('VERIFYING API_BASE_URL IN App.js:', API_BASE_URL); // DIAGNOSTIC LOG

// Log the API URL to help with debugging
console.log('Using API base URL:', API_BASE_URL);

const ITEMS_PER_PAGE = 20; // Define items per page for pagination
const SIDEBAR_WIDTH_COLLAPSED = '60px';
const SIDEBAR_WIDTH_EXPANDED = '240px';

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL and handle redirect promise
msalInstance.initialize().then(() => {
  // Handle the redirect promise after initialization
  return msalInstance.handleRedirectPromise();
}).then(response => {
  // Log successful authentication
  if (response !== null) {
    console.log("Authentication successful", response);
    const account = response.account;
    msalInstance.setActiveAccount(account);
  } else {
    // Just log that no response was received, but don't clear anything
    // This helps prevent authentication loops
    console.log("No authentication response received");
  }
}).catch(error => {
  console.error("MSAL initialization or redirect error:", error);
});

// Main app content component that uses MSAL hooks
function AppContent() {
  const { accounts } = useMsal();
  // State for all inventory items for current entity
  const [items, setItems] = useState([]);
  
  // State for filtered items (what's actually displayed)
  const [filteredItems, setFilteredItems] = useState([]);
  
  // State for tab navigation
  const [activeTab, setActiveTab] = useState('overview');
  
  // NEW Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalInventoryCount, setTotalInventoryCount] = useState(0); // Total items from API for current view
  
  // State for current view (inventory or order requests)
  const [currentView, setCurrentView] = useState('inventory'); // <-- Add new state
  // const [sidebarExpanded, setSidebarExpanded] = useState(false); // REMOVED
  
  // State for entities and entity branches
  const [entities, setEntities] = useState([]);
  const [entityBranches, setEntityBranches] = useState({});
  
  // State for filters
  const [filters, setFilters] = useState({
    entity: '', // Empty entity represents "All Branches"
    searchQuery: '',
    branch: '',
    activeTab: 'overview',
    showAdvancedFilters: false,
    advancedFiltersActive: false,
    advancedFilters: {},
    showMultiBranchOnly: false // New filter for showing only multi-branch parts
  });
  
  // State for key metrics
  const [metrics, setMetrics] = useState({
    totalSKUs: 0,
    excessItems: 0,
    lowStockItems: 0,
    deadStockItems: 0,
    totalInventoryValue: 0,
    inventoryTurnover: 0
  });
  
  // State for loading flags
  const [isInitializing, setIsInitializing] = useState(true); // Renamed from isLoading
  const [isLoadingEntity, setIsLoadingEntity] = useState(false);
  const [isTabChanging, setIsTabChanging] = useState(false);
  const [isFilterCountsLoading, setIsFilterCountsLoading] = useState(false);
  
  // For tracking real loading progress (0-100)
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // Track the last API call entity and branch for verification
  const [lastApiCall, setLastApiCall] = useState({ entity: null, branch: null });
  
  // Track the last search query to detect changes
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  
  // State for sorting
  const [sortConfig, setSortConfig] = useState({
    key: 'partNumber',
    direction: 'ascending'
  });

  // State for network status filter
  const [networkStatusFilter, setNetworkStatusFilter] = useState('');
  
  // State for error
  const [error, setError] = useState(null);
  
  // State for tab summaries and filter counts
  const [tabSummaries, setTabSummaries] = useState({
    overview: null,
    excess: null,
    lowStock: null,
    deadStock: null
  });
  
  // State for filter counts by tab
  const [filterCounts, setFilterCounts] = useState({
    overview: 0,
    excess: 0,
    lowStock: 0,
    deadStock: 0
  });
  const [globalPartBranchMap, setGlobalPartBranchMap] = useState({}); // Added state for global part-branch mapping

  // Effect to fetch global part-branch mapping
  useEffect(() => {
    const fetchGlobalPartBranchMap = async () => {
      try {
        console.log("Attempting to fetch global part-branch map from API...");
        const response = await fetch(`${API_BASE_URL}/part-branch-summary`);
        if (!response.ok) {
          throw new Error(`Failed to fetch global part-branch map: ${response.statusText} (status ${response.status})`);
        }
        const data = await response.json();
        const map = {};
        // Assuming data is in the format: { "partNo1": ["branchA", "branchB"], "partNo2": ["branchC"] }
        // If API returns null or empty, handle it gracefully.
        if (data && typeof data === 'object') {
          for (const partNumber in data) {
            if (Array.isArray(data[partNumber])) {
              map[partNumber] = new Set(data[partNumber]);
            } else {
              console.warn(`Data for partNumber ${partNumber} is not an array:`, data[partNumber]);
              map[partNumber] = new Set(); // Initialize as empty set if format is incorrect
            }
          }
          setGlobalPartBranchMap(map);
          console.log("Successfully fetched and processed global part-branch map:", map);
        } else {
          console.warn("Global part-branch summary API returned null, empty, or unexpected data format. Initializing map as empty.", data);
          setGlobalPartBranchMap({}); // Initialize as empty if data is not as expected
        }
      } catch (error) {
        console.error("Error fetching or processing global part-branch map:", error);
        setGlobalPartBranchMap({}); // Set to empty on error to prevent issues downstream
      }
    };

    if (entities && entities.length > 0) { // Fetch only if entities are loaded
        fetchGlobalPartBranchMap();
    } else {
        console.log("Entities not yet loaded, skipping fetchGlobalPartBranchMap.");
        setGlobalPartBranchMap({}); // Ensure map is cleared if entities are not present
    }
  }, [entities]); // Dependency: entities
  
  // Helper function to check which parts exist in multiple branches
  // This adds a multiBranch flag to items that exist in multiple branches
  const enrichItemsWithMultiBranchInfo = (itemsToEnrich, currentGlobalPartBranchMap) => {
    if (!itemsToEnrich || itemsToEnrich.length === 0) return itemsToEnrich;
    // If the global map isn't ready, fall back to original behavior for safety,
    // or return items as is, or log a warning.
    // Fallback to original behavior if map is empty or not provided:
    if (!currentGlobalPartBranchMap || Object.keys(currentGlobalPartBranchMap).length === 0) {
      console.warn("enrichItemsWithMultiBranchInfo: globalPartBranchMap is empty or not provided. Falling back to local multi-branch detection.");
    const partBranchMap = {};
      itemsToEnrich.forEach(item => {
      if (!item.partNumber) return;
        if (!partBranchMap[item.partNumber]) {
        partBranchMap[item.partNumber] = new Set();
      }
      partBranchMap[item.partNumber].add(item.branch);
    });
    
      return itemsToEnrich.map(item => {
      if (!item.partNumber) return item;
        const localBranchCount = partBranchMap[item.partNumber]?.size || 0;
        return {
          ...item,
          multiBranch: localBranchCount > 1,
          branchCount: localBranchCount
        };
      });
    }

    // Use the global map
    return itemsToEnrich.map(item => {
      if (!item.partNumber) return item;
      
      const branchesForThisPart = currentGlobalPartBranchMap[item.partNumber];
      const globalBranchCount = branchesForThisPart ? branchesForThisPart.size : 0;
      const isMultiBranchGlobal = globalBranchCount > 1;
      
      return {
        ...item,
        multiBranch: isMultiBranchGlobal,
        branchCount: globalBranchCount
      };
    });
  };
  
  // State for modal and selected item
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [itemBranchDetails, setItemBranchDetails] = useState([]);
  
  // State for cart modals
  const [orderCartOpen, setOrderCartOpen] = useState(false);
  const [transferCartOpen, setTransferCartOpen] = useState(false);
  const [isCartReviewModalOpen, setIsCartReviewModalOpen] = useState(false); // State for CartReviewModal
  const [cartViewType, setCartViewType] = useState('order'); // 'order' or 'transfer'
  
  // State for advanced filters modal
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  
  // State for order and transfer functionality
  const [cart, setCart] = useState({
    orders: [],
    transfers: []
  });
  const [requestStatus, setRequestStatus] = useState({
    isSubmitting: false,
    message: '',
    type: '' // 'success', 'error', or 'info'
  });

  // Load active cart from database
  const loadActiveCartFromDatabase = async () => {
    const userEmail = getUserEmail();
    if (!userEmail) {
      console.log('No user email available, skipping cart load');
      return;
    }

    try {
      console.log('Loading active cart from database for user:', userEmail);
      
      // Load both active orders and transfers in parallel
      const [ordersResponse, transfersResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/active-orders?user_email=${encodeURIComponent(userEmail)}`),
        fetch(`${API_BASE_URL}/active-transfers?user_email=${encodeURIComponent(userEmail)}`)
      ]);

      if (ordersResponse.ok && transfersResponse.ok) {
        const activeOrders = await ordersResponse.json();
        const activeTransfers = await transfersResponse.json();
        
        // Convert database format to cart format - maintain compatibility with existing UI expectations
        const cartOrders = activeOrders.map(order => ({
          id: order.order_request_id,
          quantity: order.quantity_requested,
          vendorName: order.vendor_name,
          notes: order.notes,
          requestingBranch: order.requesting_branch,
          item: {
            mfgPartNumber: order.mfg_part_number,
            partNumber: order.internal_part_number,
            description: order.item_description
          },
          // Keep database fields for API compatibility
          mfg_part_number: order.mfg_part_number,
          internal_part_number: order.internal_part_number,
          item_description: order.item_description,
          quantity_requested: order.quantity_requested,
          vendor_name: order.vendor_name,
          requesting_branch: order.requesting_branch,
          order_request_id: order.order_request_id
        }));

        const cartTransfers = activeTransfers.map(transfer => ({
          id: transfer.transfer_request_id,
          quantity: transfer.quantity_requested,
          sourceBranch: transfer.source_branch,
          destinationBranch: transfer.destination_branch,
          notes: transfer.notes,
          item: {
            mfgPartNumber: transfer.mfg_part_number,
            partNumber: transfer.internal_part_number,
            description: transfer.item_description
          },
          // Keep database fields for API compatibility
          mfg_part_number: transfer.mfg_part_number,
          internal_part_number: transfer.internal_part_number,
          item_description: transfer.item_description,
          quantity_requested: transfer.quantity_requested,
          source_branch: transfer.source_branch,
          destination_branch: transfer.destination_branch,
          transfer_request_id: transfer.transfer_request_id
        }));

        setCart({
          orders: cartOrders,
          transfers: cartTransfers
        });

        console.log(`Loaded ${cartOrders.length} active orders and ${cartTransfers.length} active transfers`);
      } else {
        console.error('Failed to load active cart from database');
      }
    } catch (error) {
      console.error('Error loading active cart:', error);
    }
  };

  // Add item to active cart in database
  const addToActiveCart = async (cartType, item) => {
    const userEmail = getUserEmail();
    if (!userEmail) {
      console.error('No user email available for cart operations');
      return;
    }

    console.log('addToActiveCart called with:', { cartType, item });

    if (!item) {
      console.error('addToActiveCart: item is undefined or null');
      return;
    }

    try {
      const endpoint = cartType === 'orders' ? '/active-orders/item' : '/active-transfers/item';
      
      console.log('Creating payload for', cartType, 'with item fields:', Object.keys(item));
      console.log('Item values:', {
        partNumber: item.partNumber,
        internalPartNumber: item.internalPartNumber,
        description: item.description,
        quantity: item.quantity,
        vendorName: item.vendorName,
        requestingBranch: item.requestingBranch
      });
      
      const payload = cartType === 'orders' ? {
        mfg_part_number: item.partNumber,
        internal_part_number: item.internalPartNumber,
        item_description: item.description,
        quantity_requested: item.quantity,
        vendor_name: item.vendorName,
        notes: item.notes || '',
        requesting_branch: item.requestingBranch,
        requested_by_user_email: userEmail
      } : {
        mfg_part_number: item.partNumber,
        internal_part_number: item.internalPartNumber,
        item_description: item.description,
        quantity_requested: item.quantity,
        source_branch: item.sourceBranch,
        destination_branch: item.destinationBranch,
        notes: item.notes || '',
        requested_by_user_email: userEmail
      };

      console.log('Payload created:', payload);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Successfully added item to ${cartType} cart:`, result);
        // Reload cart from database to get updated state
        await loadActiveCartFromDatabase();
        console.log(`Reloaded active cart from database`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to add item to ${cartType} cart. Status: ${response.status}, Error:`, errorText);
      }
    } catch (error) {
      console.error(`Error adding to ${cartType} cart:`, error);
    }
  };

  // Handlers for removing items from cart and clearing cart (now database-backed)
  const handleRemoveItemFromCart = async (cartType, index) => {
    const userEmail = getUserEmail();
    if (!userEmail) return;

    try {
      const item = cart[cartType][index];
      const itemId = cartType === 'orders' ? item.order_request_id : item.transfer_request_id;
      const endpoint = cartType === 'orders' ? '/active-orders/item' : '/active-transfers/item';

      const response = await fetch(`${API_BASE_URL}${endpoint}/${itemId}?user_email=${encodeURIComponent(userEmail)}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Reload cart from database
        await loadActiveCartFromDatabase();
        console.log(`Removed item from ${cartType} cart`);
      } else {
        console.error(`Failed to remove item from ${cartType} cart`);
      }
    } catch (error) {
      console.error(`Error removing from ${cartType} cart:`, error);
    }
  };

  const handleClearCart = async (cartType) => {
    const userEmail = getUserEmail();
    if (!userEmail) return;

    try {
      const endpoint = cartType === 'orders' ? '/active-orders/all' : '/active-transfers/all';
      
      const response = await fetch(`${API_BASE_URL}${endpoint}?user_email=${encodeURIComponent(userEmail)}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Reload cart from database
        await loadActiveCartFromDatabase();
        console.log(`Cleared ${cartType} cart`);
      } else {
        console.error(`Failed to clear ${cartType} cart`);
      }
    } catch (error) {
      console.error(`Error clearing ${cartType} cart:`, error);
    }
  };

  // Load active cart when component mounts or user changes
  useEffect(() => {
    const userEmail = getUserEmail();
    if (userEmail) {
      loadActiveCartFromDatabase();
    }
  }, [accounts]); // Reload when accounts change (user login/logout)

  // Helper to fetch data for the initial view (adapted from fetchEntityMetrics' "All Branches" path)
  const fetchDataForInitialView = async () => {
    console.log("Initializing: Fetching data for All Branches view (page: 1)...");
    try {
      const initialEntity = ''; 
      const initialSearchQuery = filters.searchQuery;
      const initialActiveTab = activeTab;
      const initialPage = 1;

          const metricsResponse = await fetch(`${API_BASE_URL}/metrics/all/complete`);
          const filterCountsResponse = await fetch(`${API_BASE_URL}/filtercounts/all`);
          const statusFilter = 
        initialActiveTab === 'excess' ? 'excess' :
        initialActiveTab === 'lowStock' ? 'low' :
        initialActiveTab === 'deadStock' ? 'dead' : null;
      
      const offset = (initialPage - 1) * ITEMS_PER_PAGE;
      const inventoryUrl = `${API_BASE_URL}/inventory?limit=${ITEMS_PER_PAGE}&offset=${offset}${
        statusFilter ? `&status=${statusFilter}` : ''}${initialSearchQuery ? `&search=${encodeURIComponent(initialSearchQuery)}` : ''}&sort_by=${sortConfig.key}&sort_dir=${sortConfig.direction === 'ascending' ? 'asc' : 'desc'}`;
          const inventoryResponse = await fetch(inventoryUrl);

      if (!metricsResponse.ok || !filterCountsResponse.ok || !inventoryResponse.ok) {
        let errorMsg = "Failed to fetch initial view data:";
        if (!metricsResponse.ok) errorMsg += ` Metrics status: ${metricsResponse.statusText}.`;
        if (!filterCountsResponse.ok) errorMsg += ` FilterCounts status: ${filterCountsResponse.statusText}.`;
        if (!inventoryResponse.ok) errorMsg += ` Inventory status: ${inventoryResponse.statusText} (${inventoryUrl}).`;
        throw new Error(errorMsg);
      }

      const metricsData = await metricsResponse.json();
      const filterCountsData = await filterCountsResponse.json();
      const inventoryData = await inventoryResponse.json();

      setTotalInventoryCount(inventoryData.totalCount || 0); // SKU count for pagination
      setCurrentPage(initialPage); 
          
          const processedMetrics = {
            totalSKUs: metricsData.totalSKUs || metricsData.total_skus || 0,
            excessItems: metricsData.excessItems || metricsData.excess_items || 0,
            lowStockItems: metricsData.lowStockItems || metricsData.low_stock_items || 0,
            deadStockItems: metricsData.deadStockItems || metricsData.dead_stock_items || 0,
            totalInventoryValue: metricsData.totalInventoryValue || metricsData.total_inventory_value || 0,
            inventoryTurnover: metricsData.inventoryTurnover || metricsData.inventory_turnover || 0,
            entityCount: metricsData.entityCount || metricsData.entity_count || entities.length,
            branchCount: metricsData.branchCount || metricsData.branch_count || 0
          };
          setMetrics({
            totalSKUs: processedMetrics.totalSKUs,
            excessItems: processedMetrics.excessItems,
            lowStockItems: processedMetrics.lowStockItems,
            deadStockItems: processedMetrics.deadStockItems,
            totalInventoryValue: processedMetrics.totalInventoryValue,
            inventoryTurnover: processedMetrics.inventoryTurnover
          });
          
          const tabSummariesData = {
            overview: {
          totalValue: filterCountsData.summaries?.overview?.totalValue || processedMetrics.totalInventoryValue, 
          totalQuantity: filterCountsData.summaries?.overview?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
          branchCount: filterCountsData.summaries?.overview?.branchCount || processedMetrics.branchCount, 
          entityCount: filterCountsData.summaries?.overview?.entityCount || processedMetrics.entityCount || entities.length, 
          inventoryTurnover: filterCountsData.summaries?.overview?.inventoryTurnover || processedMetrics.inventoryTurnover 
            },
            excess: {
          totalValue: filterCountsData.summaries?.excess?.totalValue || 0, 
          totalQuantity: filterCountsData.summaries?.excess?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
          branchCount: filterCountsData.summaries?.excess?.branchCount || processedMetrics.branchCount, 
          entityCount: filterCountsData.summaries?.excess?.entityCount || processedMetrics.entityCount || entities.length, 
          inventoryTurnover: filterCountsData.summaries?.excess?.inventoryTurnover || 0 
            },
            lowStock: {
          totalValue: filterCountsData.summaries?.lowStock?.totalValue || 0, 
          totalQuantity: filterCountsData.summaries?.lowStock?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
          branchCount: filterCountsData.summaries?.lowStock?.branchCount || processedMetrics.branchCount, 
          entityCount: filterCountsData.summaries?.lowStock?.entityCount || processedMetrics.entityCount || entities.length, 
          inventoryTurnover: filterCountsData.summaries?.lowStock?.inventoryTurnover || 0 
            },
            deadStock: {
          totalValue: filterCountsData.summaries?.deadStock?.totalValue || 0, 
          totalQuantity: filterCountsData.summaries?.deadStock?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
          branchCount: filterCountsData.summaries?.deadStock?.branchCount || processedMetrics.branchCount, 
          entityCount: filterCountsData.summaries?.deadStock?.entityCount || processedMetrics.entityCount || entities.length, 
          inventoryTurnover: filterCountsData.summaries?.deadStock?.inventoryTurnover || 0 
        }
      };
          setTabSummaries(tabSummariesData);
          
          if (inventoryData && inventoryData.items) {
        const itemsWithMultiBranchIndicator = enrichItemsWithMultiBranchInfo(inventoryData.items, globalPartBranchMap);
            setItems(itemsWithMultiBranchIndicator);
            setFilteredItems(itemsWithMultiBranchIndicator);
          } else {
            setItems([]);
            setFilteredItems([]);
          }
          
      setFilterCounts({ // These are SKU counts, should come from filterCountsData if available
        overview: filterCountsData.overviewItems || processedMetrics.totalSKUs || 0,
        excess: filterCountsData.excessItems || processedMetrics.excessItems || 0,
        lowStock: filterCountsData.lowStockItems || processedMetrics.lowStockItems || 0,
        deadStock: filterCountsData.deadStockItems || processedMetrics.deadStockItems || 0
      });
      setBranchMetrics(processedMetrics); 
      setLastApiCall({ entity: initialEntity, branch: null, page: initialPage }); 
      console.log("Initializing: Successfully fetched and processed data for All Branches view.");
        } catch (error) {
      console.error("Error fetching initial view data:", error);
      throw error; 
    }
  };

  // Main effect for initializing the application
  useEffect(() => {
    const initializeApp = async () => {
      setIsInitializing(true);
      setError(null);
          setLoadingProgress(10);
          
      try {
        // Step 1: Fetch entities (formerly fetchEntities logic)
        console.log("Initializing: Fetching entities...");
        setLoadingProgress(30);
        const response = await fetch(`${API_BASE_URL}/entities`);
                  if (!response.ok) {
          throw new Error('Failed to fetch entities: ' + response.statusText);
                  }
        setLoadingProgress(60);
                  const data = await response.json();
        setLoadingProgress(80);
        console.log(`Initialized: Received ${data.entities.length} entities.`);

        if (data.entities.length === 0) {
          console.warn("API returned no entities, falling back to mock data for entities.");
          const mockEntitiesList = [...new Set(mockItems.map(item => item.entity))];
          setEntities(mockEntitiesList);
          const mockBranchesData = {};
          mockEntitiesList.forEach(e => {
            mockBranchesData[e] = [...new Set(mockItems.filter(item => item.entity === e).map(item => item.branch))];
          });
          setEntityBranches(mockBranchesData);
        } else {
          setEntities(data.entities);
          setEntityBranches(data.entityBranches);
        }
        setLoadingProgress(100); // Entities part done

        // Step 2: Fetch initial data for default view (e.g., "All Branches")
        console.log("Initializing: Fetching initial view data...");
        // setLoadingProgress(0); // Reset for next step, or use a range like 50-100 for this
        await fetchDataForInitialView();
        console.log("Initializing: Initial view data fetched.");

        // All initial data fetched successfully
        // Removed the timeout for a quicker transition for now.
        setIsInitializing(false);
        setLoadingProgress(100); // Ensure progress is at 100%

      } catch (error) {
        console.error('Error initializing app:', error); // This will catch errors from fetchDataForInitialView too
        setError(error.message);
        // Fallback to mock entities if entity fetch failed
        console.warn("Error during entity fetch, falling back to mock entities for initialization.");
        const mockEntitiesList = [...new Set(mockItems.map(item => item.entity))];
        setEntities(mockEntitiesList);
        const mockBranchesData = {};
        mockEntitiesList.forEach(e => {
          mockBranchesData[e] = [...new Set(mockItems.filter(item => item.entity === e).map(item => item.branch))];
        });
        setEntityBranches(mockBranchesData);
        setIsInitializing(false); // Ensure loading is turned off on error
        setLoadingProgress(0);
      }
    };

    initializeApp();
  }, []); // Runs once on mount

  // Reference to search timeout
  const searchTimeoutRef = React.useRef(null);
  
  // Load metrics when entity changes - this is for "All Branches" view primarily, or a specific entity if no specific entity/branch effect handles it.
  useEffect(() => {
    if (isInitializing) {
      return;
    }
    
    let timerId = null;
    const clearManagedLoaders = () => {
        setIsLoadingEntity(false);
        setIsTabChanging(false);
        setIsFilterCountsLoading(false);
        setLoadingProgress(0);
    };

    const fetchEntityMetrics = async (searchForQuery) => {
      const entity = filters.entity;
      const activeSearchQuery = typeof searchForQuery === 'string' ? searchForQuery : '';
      
      if (!entity) { 
        console.log(`Fetching data for All Branches (all entities), page: ${currentPage}, search: "${activeSearchQuery}"`);
        setIsLoadingEntity(true);
        setIsTabChanging(true);
        setIsFilterCountsLoading(true);
        setLastApiCall({ entity: '', branch: null, page: currentPage });
        setLoadingProgress(10);
        try {
          const offset = (currentPage - 1) * ITEMS_PER_PAGE;
          const inventoryLimit = ITEMS_PER_PAGE;

          const inventoryUrl = `${API_BASE_URL}/inventory?limit=${inventoryLimit}&offset=${offset}${activeTab === 'excess' ? '&status=excess' : activeTab === 'lowStock' ? '&status=low' : activeTab === 'deadStock' ? '&status=dead' : ''}${activeSearchQuery ? `&search=${encodeURIComponent(activeSearchQuery)}` : ''}&sort_by=${sortConfig.key}&sort_dir=${sortConfig.direction === 'ascending' ? 'asc' : 'desc'}`;
          const metricsUrl = `${API_BASE_URL}/metrics/all/complete${activeSearchQuery ? `?search=${encodeURIComponent(activeSearchQuery)}` : ''}`;
          const filterCountsUrl = `${API_BASE_URL}/filtercounts/all${activeSearchQuery ? `?search=${encodeURIComponent(activeSearchQuery)}` : ''}`;

          const [metricsResponse, filterCountsResponse, inventoryResponse] = await Promise.all([
            fetch(metricsUrl),
            fetch(filterCountsUrl),
            fetch(inventoryUrl) 
          ]);

          setLoadingProgress(40);
          if (!metricsResponse.ok) throw new Error(`Failed to fetch All Branches metrics: ${metricsResponse.statusText} (${metricsUrl})`);
          if (!filterCountsResponse.ok) throw new Error(`Failed to fetch All Branches filter counts: ${filterCountsResponse.statusText} (${filterCountsUrl})`);
          if (!inventoryResponse.ok) throw new Error(`Failed to fetch All Branches inventory: ${inventoryResponse.statusText} (${inventoryUrl})`);
          
          const metricsData = await metricsResponse.json();
          const rawFilterCountsResponseText = await filterCountsResponse.text(); // Get raw text first
          let filterCountsData;
          try {
            filterCountsData = JSON.parse(rawFilterCountsResponseText); // Try to parse
          } catch (e) {
            console.error("Failed to parse filterCountsResponse JSON:", e);
            console.error("Raw filterCountsResponse text:", rawFilterCountsResponseText);
            throw new Error("FilterCounts API response was not valid JSON.");
          }
          
          const inventoryData = await inventoryResponse.json();
          setLoadingProgress(70);
          
          // DEBUG LOGGING START
          console.log("--- DEBUG: fetchEntityMetrics (All Branches) ---");
          console.log("Raw filterCountsData received from API:", filterCountsData);
          if (filterCountsData && filterCountsData.summaries) {
            console.log("filterCountsData.summaries:", filterCountsData.summaries);
            console.log("filterCountsData.summaries.overview:", filterCountsData.summaries.overview);
            if (filterCountsData.summaries.overview) {
              console.log("Value for sumOfQuantityOnHand in overview summary:", filterCountsData.summaries.overview.sumOfQuantityOnHand);
            }
          } else {
            console.log("filterCountsData.summaries is missing or undefined.");
          }
          // DEBUG LOGGING END
          
          setTotalInventoryCount(inventoryData.totalCount || 0);
          
          const processedMetrics = {
            totalSKUs: metricsData.totalSKUs || metricsData.total_skus || 0,
            excessItems: metricsData.excessItems || metricsData.excess_items || 0,
            lowStockItems: metricsData.lowStockItems || metricsData.low_stock_items || 0,
            deadStockItems: metricsData.deadStockItems || metricsData.dead_stock_items || 0,
            totalInventoryValue: metricsData.totalInventoryValue || metricsData.total_inventory_value || 0,
            inventoryTurnover: metricsData.inventoryTurnover || metricsData.inventory_turnover || 0,
            entityCount: metricsData.entityCount || metricsData.entity_count || entities.length,
            branchCount: metricsData.branchCount || metricsData.branch_count || 0
          };
          setMetrics({
            totalSKUs: processedMetrics.totalSKUs,
            excessItems: processedMetrics.excessItems,
            lowStockItems: processedMetrics.lowStockItems,
            deadStockItems: processedMetrics.deadStockItems,
            totalInventoryValue: processedMetrics.totalInventoryValue,
            inventoryTurnover: processedMetrics.inventoryTurnover
          });

          const tabSummariesData = {
                      overview: {
              totalValue: filterCountsData.summaries?.overview?.totalValue || processedMetrics.totalInventoryValue, 
              totalQuantity: filterCountsData.summaries?.overview?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
              branchCount: filterCountsData.summaries?.overview?.branchCount || processedMetrics.branchCount, 
              entityCount: filterCountsData.summaries?.overview?.entityCount || processedMetrics.entityCount || entities.length, 
              inventoryTurnover: filterCountsData.summaries?.overview?.inventoryTurnover || processedMetrics.inventoryTurnover 
                      },
                      excess: {
              totalValue: filterCountsData.summaries?.excess?.totalValue || 0, 
              totalQuantity: filterCountsData.summaries?.excess?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
              branchCount: filterCountsData.summaries?.excess?.branchCount || processedMetrics.branchCount, 
              entityCount: filterCountsData.summaries?.excess?.entityCount || processedMetrics.entityCount || entities.length, 
              inventoryTurnover: filterCountsData.summaries?.excess?.inventoryTurnover || 0 
                      },
                      lowStock: {
              totalValue: filterCountsData.summaries?.lowStock?.totalValue || 0, 
              totalQuantity: filterCountsData.summaries?.lowStock?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
              branchCount: filterCountsData.summaries?.lowStock?.branchCount || processedMetrics.branchCount, 
              entityCount: filterCountsData.summaries?.lowStock?.entityCount || processedMetrics.entityCount || entities.length, 
              inventoryTurnover: filterCountsData.summaries?.lowStock?.inventoryTurnover || 0 
                      },
                      deadStock: {
              totalValue: filterCountsData.summaries?.deadStock?.totalValue || 0, 
              totalQuantity: filterCountsData.summaries?.deadStock?.sumOfQuantityOnHand || 0, // Use .sumOfQuantityOnHand from API summary
              branchCount: filterCountsData.summaries?.deadStock?.branchCount || processedMetrics.branchCount, 
              entityCount: filterCountsData.summaries?.deadStock?.entityCount || processedMetrics.entityCount || entities.length, 
              inventoryTurnover: filterCountsData.summaries?.deadStock?.inventoryTurnover || 0 
            }
          };
          setTabSummaries(tabSummariesData);

          if (inventoryData && inventoryData.items) {
            const itemsWithMultiBranchIndicator = enrichItemsWithMultiBranchInfo(inventoryData.items, globalPartBranchMap);
            setItems(itemsWithMultiBranchIndicator);
          } else {
            setItems([]);
          }
          setFilterCounts({ // SKU counts
            overview: filterCountsData.overviewItems || processedMetrics.totalSKUs || 0,
            excess: filterCountsData.excessItems || processedMetrics.excessItems || 0,
            lowStock: filterCountsData.lowStockItems || processedMetrics.lowStockItems || 0,
            deadStock: filterCountsData.deadStockItems || processedMetrics.deadStockItems || 0
          });
          setBranchMetrics(processedMetrics);
          
          setLoadingProgress(100);
          if(timerId) clearTimeout(timerId);
          timerId = setTimeout(clearManagedLoaders, 300);
          
        } catch (error) {
          console.error("Error fetching All Branches data:", error);
          setError(error.message || 'Failed to load data for All Branches.');
          setTotalInventoryCount(0); 
          if(timerId) clearTimeout(timerId);
          timerId = setTimeout(clearManagedLoaders, 300);
        }
        return;
      }
    };
    
    // Commented out to use the new implementation in the useEffect for entity data fetching
    // if (!filters.entity && !filters.advancedFiltersActive) { 
    //     fetchEntityMetrics(filters.searchQuery); 
    // }
    
    return () => {
        if(timerId) clearTimeout(timerId);
    }

  }, [filters.entity, filters.searchQuery, entities, isInitializing, activeTab, currentPage, filters.advancedFiltersActive, sortConfig, networkStatusFilter]);
  
  // Fetch inventory data function - THIS FUNCTION IS NOW LARGELY OBSOLETE
  const fetchInventoryData = async (entity, searchQuery, updateLoadingState = true) => {
    try {
      // Allow empty entity for "All Branches" option
      
      // For "All Branches" case, use a different endpoint or parameter
      
      // Format search parameter and always use limit=0 to get all data for accurate metrics
      // When there's a search query, add it as an additional parameter
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      
      // Fetch inventory data - use different endpoint for "All Branches" vs. specific entity
      let inventoryResponse;
      if (!entity) {
        // For "All Branches" - use all entities endpoint or parameter
        inventoryResponse = await fetch(`${API_BASE_URL}/inventory/all?limit=0${searchParam}`);
      } else {
        // For specific entity
        inventoryResponse = await fetch(`${API_BASE_URL}/inventory/${entity}?limit=0${searchParam}`);
      }
      if (!inventoryResponse.ok) {
        throw new Error(`Failed to fetch inventory ${entity ? `for ${entity}` : 'for All Branches'}: ${inventoryResponse.statusText}`);
      }
      
      const inventoryData = await inventoryResponse.json();
      
      if (inventoryData.items && Array.isArray(inventoryData.items)) {
        // New API format with pagination
        console.log(`Received ${inventoryData.items.length} out of ${inventoryData.totalCount} total items for entity ${entity}`);
        // Just set the items directly - no longer storing complete dataset
        // Enhance with multi-branch indicators
        const itemsWithMultiBranchInfo = enrichItemsWithMultiBranchInfo(inventoryData.items.slice(0, 20), globalPartBranchMap);
        setItems(itemsWithMultiBranchInfo);
      } else if (Array.isArray(inventoryData)) {
        // Old API format (backward compatibility)
        console.log(`Received ${inventoryData.length} items for entity ${entity}`);
        // Just set the items directly - no longer storing complete dataset
        // Enhance with multi-branch indicators
        const itemsWithMultiBranchInfo = enrichItemsWithMultiBranchInfo(inventoryData.slice(0, 20), globalPartBranchMap);
        setItems(itemsWithMultiBranchInfo);
      } else {
        console.warn(`Unexpected data format for entity ${entity}, using empty array`);
        setItems([]);
      }
      
      if (updateLoadingState) {
        setIsLoadingEntity(false);
      }
      
      return inventoryData;
      
    } catch (error) {
      console.error(`Error fetching inventory for ${entity}:`, error);
      setError(`Error loading inventory for ${entity}: ${error.message}`);
      if (updateLoadingState) {
        setIsLoadingEntity(false);
      }
      throw error;
    }
  };

  // Calculate filtered item counts for the tabs
  const [filteredCounts, setFilteredCounts] = useState({
    totalItems: 0,
    excessItems: 0,
    lowStockItems: 0,
    deadStockItems: 0
  });
  
  // Tab summaries and filter counts are now handled by the state declared earlier
  
  // Function to clear all loading states and errors if data loaded successfully
  // Only clear loading states if the displayed data matches the user's selection
  const clearAllLoadingStates = () => {
    // For debugging only - log the current filters and last API call
    console.log("clearAllLoadingStates called with:", {
      currentFilters: {
        entity: filters.entity,
        branch: filters.branch,
        advancedFiltersActive: filters.advancedFiltersActive
      },
      lastApiCall: {
        entity: lastApiCall.entity,
        branch: lastApiCall.branch
      }
    });
    
    // Handle advanced filters case - always clear loading states
    if (filters.advancedFiltersActive) {
      console.log("Advanced filters case - clearing loading states");
      setIsLoadingEntity(false);
      setIsFilterCountsLoading(false);
      setIsTabChanging(false);
      return;
    }
    
    // Force loading states to clear for "All Branches" case
    // This is a hack to ensure loading states are cleared even if there's a mismatch
    if (!filters.entity || lastApiCall.entity === '') {
      console.log("All Branches case detected - forcing clearing of loading states");
      setIsLoadingEntity(false);
      setIsTabChanging(false);
      setIsFilterCountsLoading(false);
      setLoadingProgress(100);
      return;
    }
    
    // Check if the API call matches what the user selected
    const dataMatchesSelection = () => {
      // For advanced filters
      if (filters.advancedFiltersActive) {
        return lastApiCall.entity === 'advanced-filters';
      }
      
      // Check if current selection matches last API call
      const entityMatches = filters.entity === lastApiCall.entity;
      const branchMatches = filters.branch === lastApiCall.branch;
      
      if (!entityMatches || !branchMatches) {
        console.log(`Data mismatch: Selected entity=${filters.entity}, branch=${filters.branch || 'none'}, ` +
                    `but last API call was for entity=${lastApiCall.entity}, branch=${lastApiCall.branch || 'none'}`);
        return false;
      }
      
      return true;
    };
    
    // Only clear loading states if data matches selection
    if (dataMatchesSelection()) {
      // Set a verification timer to double-check after 4 seconds
      // This helps catch race conditions where the lastApiCall state might not be updated yet
      const currentEntity = filters.entity;
      const currentBranch = filters.branch;
      
      // Clear loading states now
      setIsLoadingEntity(false);
      setIsTabChanging(false);
      setIsFilterCountsLoading(false);
      setLoadingProgress(0); // Reset progress to 0 when done
      
      // Clear any error messages
      setError(null);
      
      // Schedule a verification check to catch any race conditions
      setTimeout(() => {
        // If the user has changed selection since we cleared loading state
        // and the data doesn't match the new selection, re-enable loading state
        if (currentEntity !== filters.entity || currentBranch !== filters.branch) {
          console.log("Double-check verification: User selection changed after loading cleared");
          console.log(`Current selection: entity=${filters.entity}, branch=${filters.branch || 'none'}`);
          console.log(`Last API call: entity=${lastApiCall.entity}, branch=${lastApiCall.branch || 'none'}`);
          
          // Only put loading back if the current selection doesn't match the last API call
          if (filters.entity !== lastApiCall.entity || filters.branch !== lastApiCall.branch) {
            console.log("Re-enabling loading states due to verification mismatch");
            setIsLoadingEntity(true);
            setIsTabChanging(true);
            setIsFilterCountsLoading(true);
          }
        }
      }, 4000); // 4 second verification check
    } else {
      console.log("Not clearing loading states yet - data doesn't match selection");
      // If data doesn't match selection, maintain loading state and try again in a moment
      setTimeout(clearAllLoadingStates, 500);
    }
  };
  
  // We no longer store or use complete entity data - everything is server-side
  
  // Apply filters and sorting whenever filters, items, or sorting changes
  
  // Store whether we've already fetched the key metrics for the current advanced filter
  const [advancedFilterMetricsFetched, setAdvancedFilterMetricsFetched] = useState(false);
  
  // Effect to handle advanced filters with optimized API calls
  useEffect(() => {
    // Reset the metrics fetched flag when filters change (not just tabs)
    if (filters.advancedFiltersActive && filters.advancedFilters) {
      console.log("Advanced filters changed - resetting metrics fetched flag");
      setAdvancedFilterMetricsFetched(false);
    }
  }, [JSON.stringify(filters.advancedFilters)]);
  
  // Effect to handle advanced filters with optimized API calls (THIS IS THE ONE TO MODIFY FOR PAGINATION)
  useEffect(() => {
    if (filters.advancedFiltersActive && filters.advancedFilters) {
      setIsLoadingEntity(true);
      setIsFilterCountsLoading(true);
      setLoadingProgress(10); 
      
      const fetchAdvancedFilteredData = async () => {
        // ADDED console log for current page and search query
        console.log(`Fetching advanced filtered data, page: ${currentPage}, search: "${filters.searchQuery}", filters:`, filters.advancedFilters);
        try {
          const { selectedEntities, selectedBranches, showAllBranches } = filters.advancedFilters;
          
          if (!selectedEntities || selectedEntities.length === 0) {
            setItems([]);
            setMetrics({ /* ... zero metrics ... */ });
            setTotalInventoryCount(0); // ADDED: Reset count
            setIsLoadingEntity(false);
            setIsFilterCountsLoading(false);
            setLoadingProgress(0);
            return;
          }
          
          let selectedBranchList = []; /* ... populate as before ... */
          if (!showAllBranches) {
            for (const entity of selectedEntities) {
              if (selectedBranches[entity] && selectedBranches[entity].length > 0) {
                selectedBranchList = [...selectedBranchList, ...selectedBranches[entity]];
              }
            }
          }
          
          // ADDED page to setLastApiCall
          setLastApiCall({
            entity: 'advanced-filters',
            branch: selectedBranchList.length > 0 ? selectedBranchList[0] : null,
            page: currentPage // Include page in lastApiCall for advanced filters too
          });
          
          const statusFilter = activeTab === 'excess' ? 'excess' : activeTab === 'lowStock' ? 'low' : activeTab === 'deadStock' ? 'dead' : null;
          
          // === Metrics URL Construction (remains largely the same, metrics usually aren't paginated themselves) ===
          let metricsUrl = '';
          if (selectedBranchList.length > 0) {
            metricsUrl = `${API_BASE_URL}/metrics/advanced?branches=${selectedBranchList.join(',')}`;
          } else {
            const entitiesParam = selectedEntities.join(',');
            metricsUrl = `${API_BASE_URL}/metrics/advanced?entities=${entitiesParam}`;
          }
          if (statusFilter) metricsUrl += `&status=${statusFilter}`;
          if (filters.searchQuery) metricsUrl += `&search=${encodeURIComponent(filters.searchQuery)}&search_limit=100`;
          
          console.log(`Fetching advanced metrics: ${metricsUrl}`);
          setLoadingProgress(30);
          const metricsResponse = await fetch(metricsUrl);
          if (!metricsResponse.ok) throw new Error(`Failed to fetch advanced metrics: ${metricsResponse.statusText}`);
          let metricsData = await metricsResponse.json();
          // ... (logic for fetching allTabsMetricsData if statusFilter is present, combining into metricsData) ...
          // This part (allTabsMetricsData) should remain as is.
          let allTabsMetricsData = { ...metricsData };
          const originalStatusFilter = statusFilter;
          if (statusFilter) { /* ... existing logic to fetch for other tabs and overview ... */ }
          metricsData = allTabsMetricsData; // Ensure metricsData has combined results
          // ... (logic for calculating proportional values if missing from API) ...
          
          setLoadingProgress(50);
          
          // === Inventory Data URL Construction (MODIFIED FOR PAGINATION) ===
          const offset = (currentPage - 1) * ITEMS_PER_PAGE;
          const limit = ITEMS_PER_PAGE;
          let dataUrl = '';
          
          if (filters.searchQuery) {
            if (selectedEntities.length === 1) {
              dataUrl = `${API_BASE_URL}/inventory/${selectedEntities[0]}?limit=${limit}&offset=${offset}`;
            } else {
              dataUrl = `${API_BASE_URL}/inventory?limit=${limit}&offset=${offset}`;
            }
            dataUrl += `&search=${encodeURIComponent(filters.searchQuery)}`;
            if (!showAllBranches && selectedBranchList.length === 1) dataUrl += `&branch=${selectedBranchList[0]}`;
            if (statusFilter) dataUrl += `&status=${statusFilter}`;
            if (networkStatusFilter) dataUrl += `&network_status=${networkStatusFilter}`;
          } else {
            if (selectedBranchList.length > 0) {
              const entityWithMostBranches = Object.entries(selectedBranches).reduce((max, [entity, branches]) => (branches?.length > (max?.branches?.length || 0)) ? {entity, branches} : max, null)?.entity || selectedEntities[0];
              dataUrl = `${API_BASE_URL}/inventory?limit=${limit}&offset=${offset}&entity=${entityWithMostBranches}`;
            } else {
              dataUrl = `${API_BASE_URL}/inventory?limit=${limit}&offset=${offset}&entity=${selectedEntities[0]}`;
            }
            if (statusFilter) dataUrl += `&status=${statusFilter}`;
            if (networkStatusFilter) dataUrl += `&network_status=${networkStatusFilter}`;
          }
          
          let displayData = { items: [], totalCount: 0 }; // Default if no dataUrl
          if (dataUrl) {
            console.log(`Fetching advanced display data (paginated): ${dataUrl}`);
            const dataResponse = await fetch(dataUrl);
            if (!dataResponse.ok) throw new Error(`Failed to fetch advanced display data: ${dataResponse.statusText} (${dataUrl})`);
            displayData = await dataResponse.json();
          }
          setLoadingProgress(70);

          setTotalInventoryCount(displayData.totalCount || 0); // Set total count from inventory response
          
          let filteredDisplayItems = displayData.items || [];
          // ... (existing logic to further client-side filter filteredDisplayItems based on selectedEntities/Branches if needed, after API fetch)
          // This part might need review if API is already doing precise filtering.
          // For now, assume API returns items for the given page, and further client filtering is minimal or specific for multi-selects.
          if (filters.searchQuery) { /* existing filtering logic for search results */ }
          else if (selectedBranchList.length > 0 && !showAllBranches) { /* existing filtering logic for branches */ }

          setItems(filteredDisplayItems);
          
          // Set Metrics, FilterCounts, TabSummaries, BranchMetrics (using metricsData and displayData.totalCount where appropriate)
          // This part of the logic (setting these states) should remain largely the same as before, 
          // just ensure any item counts use displayData.totalCount or specific counts from metricsData.
          // ... (existing state setting logic for setMetrics, setFilteredCounts, setTabSummaries, setBranchMetrics)

          setLoadingProgress(100);
          clearAllLoadingStates();
          
          // Update overall metrics and tab summaries based on metricsData from /metrics/advanced
          if (metricsData) {
            const newAdvancedMetrics = {
              totalSKUs: metricsData.totalSKUs || 0,
              excessItems: metricsData.excessItems || 0,
              lowStockItems: metricsData.lowStockItems || 0,
              deadStockItems: metricsData.deadStockItems || 0,
              totalInventoryValue: metricsData.summaries?.overview?.totalValue || 0,
              inventoryTurnover: metricsData.summaries?.overview?.inventoryTurnover || 0,
              entityCount: metricsData.entities_in_result?.length || metricsData.summaries?.overview?.entityCount || 0,
              branchCount: metricsData.branches_in_result?.length || metricsData.summaries?.overview?.branchCount || 0
            };
            console.log("ADVANCED FILTERS - newAdvancedMetrics object being set:", JSON.stringify(newAdvancedMetrics, null, 2)); // DIAGNOSTIC LOG 2
            setMetrics(newAdvancedMetrics); // Update general metrics state
            setBranchMetrics(newAdvancedMetrics); // ALSO UPDATE branchMetrics for KeyMetrics component

            // Special handling for search queries in advanced filters
            if (filters.searchQuery && displayData.items && displayData.items.length > 0) {
              console.log(`Part number search with advanced filters: "${filters.searchQuery}" - calculating metrics from ${displayData.items.length} items`);
              
              // Get the enriched items
              const enrichedItems = enrichItemsWithMultiBranchInfo(displayData.items, globalPartBranchMap);
              
              // Count items for each tab for filter counts
              const overviewCount = enrichedItems.length;
              const excessCount = enrichedItems.filter(i => i.status === 'excess').length;
              const lowStockCount = enrichedItems.filter(i => i.status === 'low').length;
              const deadStockCount = enrichedItems.filter(i => i.status === 'dead').length;
              
              // Calculate total quantities for each tab
              const overviewTotalQuantity = enrichedItems.reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
              const excessTotalQuantity = enrichedItems.filter(i => i.status === 'excess').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
              const lowStockTotalQuantity = enrichedItems.filter(i => i.status === 'low').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
              const deadStockTotalQuantity = enrichedItems.filter(i => i.status === 'dead').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
              
              // Calculate total value for each tab
              const overviewTotalValue = enrichedItems.reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
              const excessTotalValue = enrichedItems.filter(i => i.status === 'excess').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
              const lowStockTotalValue = enrichedItems.filter(i => i.status === 'low').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
              const deadStockTotalValue = enrichedItems.filter(i => i.status === 'dead').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
              
              // Count distinct branches for each tab
              const overviewBranches = new Set(enrichedItems.map(item => item.branch)).size;
              const excessBranches = new Set(enrichedItems.filter(i => i.status === 'excess').map(item => item.branch)).size;
              const lowStockBranches = new Set(enrichedItems.filter(i => i.status === 'low').map(item => item.branch)).size;
              const deadStockBranches = new Set(enrichedItems.filter(i => i.status === 'dead').map(item => item.branch)).size;
              
              // Calculate inventory turnover if possible
              let overviewTurnover = newAdvancedMetrics.inventoryTurnover;
              if (overviewTotalValue > 0) {
                // Try to calculate from search results
                const ttmQtyUsed = enrichedItems.reduce((sum, item) => sum + (Number(item.ttmQtyUsed) || 0), 0);
                if (ttmQtyUsed > 0) {
                  const avgCost = overviewTotalValue / overviewTotalQuantity;
                  const annualCogs = ttmQtyUsed * avgCost;
                  overviewTurnover = annualCogs / overviewTotalValue;
                }
              }
              
              console.log("Advanced filters - calculated metrics for search:", {
                counts: { overview: overviewCount, excess: excessCount, lowStock: lowStockCount, deadStock: deadStockCount },
                quantity: { overview: overviewTotalQuantity, excess: excessTotalQuantity, lowStock: lowStockTotalQuantity, deadStock: deadStockTotalQuantity },
                value: { overview: overviewTotalValue, excess: excessTotalValue, lowStock: lowStockTotalValue, deadStock: deadStockTotalValue },
                branches: { overview: overviewBranches, excess: excessBranches, lowStock: lowStockBranches, deadStock: deadStockBranches }
              });
              
              // Update filter counts for tab numbers based on actual search results
          setFilteredCounts({
                total: overviewCount,
                excess: excessCount,
                low: lowStockCount,
                dead: deadStockCount,
              });
              
              // Set tab summaries using calculated values
              setTabSummaries({
            overview: {
                  totalValue: overviewTotalValue,
                  totalQuantity: overviewTotalQuantity,
                  branchCount: overviewBranches,
                  entityCount: selectedEntities.length,
                  inventoryTurnover: overviewTurnover
            },
            excess: {
                  totalValue: excessTotalValue,
                  totalQuantity: excessTotalQuantity,
                  branchCount: excessBranches,
                  entityCount: selectedEntities.length,
                  inventoryTurnover: 0
            },
            lowStock: {
                  totalValue: lowStockTotalValue,
                  totalQuantity: lowStockTotalQuantity,
                  branchCount: lowStockBranches,
                  entityCount: selectedEntities.length,
                  inventoryTurnover: 0
            },
            deadStock: {
                  totalValue: deadStockTotalValue,
                  totalQuantity: deadStockTotalQuantity,
                  branchCount: deadStockBranches,
                  entityCount: selectedEntities.length,
                  inventoryTurnover: 0
                }
              });
            } else {
              // For non-search views, use API data
              if (metricsData.summaries) {
                setTabSummaries(metricsData.summaries);
              }
              
              setFilteredCounts({
                total: metricsData.totalSKUs || 0,
                excess: metricsData.excessItems || 0,
                lowStock: metricsData.lowStockItems || 0,
                deadStock: metricsData.deadStockItems || 0,
              });
            }
          } else {
            // Reset if no metricsData
            const zeroMetrics = { totalSKUs: 0, excessItems: 0, lowStockItems: 0, deadStockItems: 0, totalInventoryValue: 0, inventoryTurnover: 0, entityCount: 0, branchCount: 0 };
            setMetrics(zeroMetrics);
            setBranchMetrics(zeroMetrics);
            setTabSummaries({ overview: {}, excess: {}, lowStock: {}, deadStock: {} });
            setFilteredCounts({ total: 0, excess: 0, low: 0, dead: 0 });
          }
          
          setLoadingProgress(100);
        } catch (error) {
          console.error('Error fetching advanced filtered data:', error);
          setError(`Error loading advanced filtered data: ${error.message}`);
          setItems([]);
          setTotalInventoryCount(0); // Reset total count on error
          setMetrics({ totalSKUs: 0, excessItems: 0, lowStockItems: 0, deadStockItems: 0, totalInventoryValue: 0, inventoryTurnover: 0 });
          // ... (reset other relevant states like tabSummaries, filterCounts, branchMetrics)
          clearAllLoadingStates(); // Ensure loaders are cleared on error
        }
      };
      
      fetchAdvancedFilteredData();
      // Removed the 'return;' here as this useEffect might be the primary one for advanced filters.
      // If there was a specific reason for it (e.g. to prevent another effect from running), that needs re-evaluation.
    }
    // If advanced filters are NOT active, we might want to clear some states or ensure normal effects run.
    // For now, this effect only acts when advancedFiltersActive is true.
  }, [filters.advancedFiltersActive, filters.advancedFilters, activeTab, currentPage, filters.searchQuery, networkStatusFilter]); // MODIFIED: Added currentPage and filters.searchQuery
  
  // Store the original metrics that never change with tab selection
  const [branchMetrics, setBranchMetrics] = useState({
    totalSKUs: 0,
    excessItems: 0,
    lowStockItems: 0,
    deadStockItems: 0,
    totalInventoryValue: 0,
    inventoryTurnover: 0
  });

  // Effect to fetch entity data with pagination and server-side metrics
  // This is the main effect for specific entities (NOT All Branches, NOT Advanced Filters, NOT during initial load)
  useEffect(() => {
    // Special case: If we want to use advanced filters endpoint for "All Branches"
    if (!filters.entity && !filters.advancedFiltersActive && !isInitializing) {
      // Create advanced filters object that selects all entities and branches
      const allEntitiesFilter = {
        selectedEntities: entities,
        selectedBranches: {},
        showAllBranches: true
      };
      
      // Use the advanced filters endpoint but keep the UI in "All Branches" mode
      const fetchAllBranchesWithAdvancedEndpoint = async () => {
    setIsLoadingEntity(true);
    setIsTabChanging(true);
    setIsFilterCountsLoading(true);
    setLoadingProgress(10);
    
        try {
          const statusFilter = activeTab === 'excess' ? 'excess' : activeTab === 'lowStock' ? 'low' : activeTab === 'deadStock' ? 'dead' : null;
          const offset = (currentPage - 1) * ITEMS_PER_PAGE;
          const searchQuery = filters.searchQuery || '';
          
          // Create URL for metrics using advanced filters endpoint
          let metricsUrl = `${API_BASE_URL}/metrics/advanced?entities=${entities.join(',')}`;
          if (statusFilter) metricsUrl += `&status=${statusFilter}`;
          if (searchQuery) metricsUrl += `&search=${encodeURIComponent(searchQuery)}`;
          
          // Create URL for inventory data
          let dataUrl = `${API_BASE_URL}/inventory?limit=${ITEMS_PER_PAGE}&offset=${offset}`;
          if (searchQuery) dataUrl += `&search=${encodeURIComponent(searchQuery)}`;
          if (statusFilter) dataUrl += `&status=${statusFilter}`;
          if (networkStatusFilter) dataUrl += `&network_status=${networkStatusFilter}`;
          dataUrl += `&sort_by=${sortConfig.key}&sort_dir=${sortConfig.direction === 'ascending' ? 'asc' : 'desc'}`;

          // Add additional URL for filter counts data to get accurate summaries
          let filterCountsUrl = `${API_BASE_URL}/filtercounts/all`;
          if (searchQuery) filterCountsUrl += `?search=${encodeURIComponent(searchQuery)}`;
          if (statusFilter) filterCountsUrl += filterCountsUrl.includes('?') ? `&status=${statusFilter}` : `?status=${statusFilter}`;
          
          console.log(`Using advanced endpoint for All Branches tab: ${metricsUrl}`);
          console.log(`Getting filter counts from: ${filterCountsUrl}`);
          console.log(`Search query: "${searchQuery}"`);
          
          const [metricsResponse, dataResponse, filterCountsResponse] = await Promise.all([
            fetch(metricsUrl),
            fetch(dataUrl),
            fetch(filterCountsUrl)
          ]);
          
          if (!metricsResponse.ok) throw new Error(`Failed to fetch advanced metrics: ${metricsResponse.statusText}`);
          if (!dataResponse.ok) throw new Error(`Failed to fetch inventory data: ${dataResponse.statusText}`);
          if (!filterCountsResponse.ok) throw new Error(`Failed to fetch filter counts: ${filterCountsResponse.statusText}`);
          
          const metricsData = await metricsResponse.json();
          const displayData = await dataResponse.json();
          const filterCountsData = await filterCountsResponse.json();
          
          setLoadingProgress(70);
          
          // Ensure we get the inventory items
          const items = displayData.items ? enrichItemsWithMultiBranchInfo(displayData.items, globalPartBranchMap) : [];
          setTotalInventoryCount(displayData.totalCount || 0);
          setItems(items);
          
          // For part number searches, calculate the total quantity directly from the items
          let overviewTotalQuantity = 0;
          let excessTotalQuantity = 0;
          let lowStockTotalQuantity = 0;
          let deadStockTotalQuantity = 0;
          
          // If this is a search query and we have results, calculate all metrics directly from items
          if (searchQuery && items.length > 0) {
            console.log(`Part number search: "${searchQuery}" - calculating metrics from ${items.length} items`);
            
            // Calculate quantities for each tab
            overviewTotalQuantity = items.reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
            excessTotalQuantity = items.filter(i => i.status === 'excess').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
            lowStockTotalQuantity = items.filter(i => i.status === 'low').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
            deadStockTotalQuantity = items.filter(i => i.status === 'dead').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
            
            // Calculate total value for each tab
            const overviewTotalValue = items.reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            const excessTotalValue = items.filter(i => i.status === 'excess').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            const lowStockTotalValue = items.filter(i => i.status === 'low').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            const deadStockTotalValue = items.filter(i => i.status === 'dead').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            
            // Count distinct branches for each tab
            const overviewBranches = new Set(items.map(item => item.branch)).size;
            const excessBranches = new Set(items.filter(i => i.status === 'excess').map(item => item.branch)).size;
            const lowStockBranches = new Set(items.filter(i => i.status === 'low').map(item => item.branch)).size;
            const deadStockBranches = new Set(items.filter(i => i.status === 'dead').map(item => item.branch)).size;
            
            // Count items for each tab for filter counts
            const overviewCount = items.length;
            const excessCount = items.filter(i => i.status === 'excess').length;
            const lowStockCount = items.filter(i => i.status === 'low').length;
            const deadStockCount = items.filter(i => i.status === 'dead').length;
            
            // Calculate inventory turns (use existing formula from code or a simplified one)
            // For search results, we'll use a simple approximation
            let overviewTurnover = 0;
            if (overviewTotalValue > 0) {
              // Try to get ttmQtyUsed and averageCost to calculate a more accurate turnover
              const ttmQtyUsed = items.reduce((sum, item) => sum + (Number(item.ttmQtyUsed) || 0), 0);
              if (ttmQtyUsed > 0) {
                // This is a simplified formula to estimate turnover from search results
                const avgCost = overviewTotalValue / overviewTotalQuantity;
                const annualCogs = ttmQtyUsed * avgCost;
                overviewTurnover = annualCogs / overviewTotalValue;
              } else {
                // Fallback to API value if we can't calculate
                overviewTurnover = metricsData.summaries?.overview?.inventoryTurnover || 0;
              }
            }
            
            console.log("Calculated metrics for search:", {
              quantity: {
                overview: overviewTotalQuantity,
                excess: excessTotalQuantity,
                lowStock: lowStockTotalQuantity,
                deadStock: deadStockTotalQuantity
              },
              value: {
                overview: overviewTotalValue,
                excess: excessTotalValue,
                lowStock: lowStockTotalValue,
                deadStock: deadStockTotalValue
              },
              branches: {
                overview: overviewBranches,
                excess: excessBranches,
                lowStock: lowStockBranches,
                deadStock: deadStockBranches
              },
              counts: {
                overview: overviewCount,
                excess: excessCount,
                lowStock: lowStockCount,
                deadStock: deadStockCount
              },
              turnover: overviewTurnover
            });
            
            // Update filter counts for tab numbers based on actual search results
            setFilterCounts({
              overview: overviewCount,
              excess: excessCount,
              lowStock: lowStockCount,
              deadStock: deadStockCount
            });
            
            // Store calculated values in a variable for use in the tab summaries
            // Using regular variables instead of 'this' which is not appropriate in this context
            // We already have these variables in scope for use in the tabSummaries calculation below
          }
          
          // Use the metrics from the advanced endpoint
          const newMetrics = {
            totalSKUs: metricsData.totalSKUs || 0,
            excessItems: metricsData.excessItems || 0,
            lowStockItems: metricsData.lowStockItems || 0,
            deadStockItems: metricsData.deadStockItems || 0,
            totalInventoryValue: metricsData.summaries?.overview?.totalValue || 0,
            inventoryTurnover: metricsData.summaries?.overview?.inventoryTurnover || 0,
            entityCount: metricsData.entities_in_result?.length || entities.length,
            branchCount: metricsData.branches_in_result?.length || 0
          };
          
          setMetrics(newMetrics);
          setBranchMetrics(newMetrics);
          
          // Log what we're getting for debugging
          console.log("Filter Counts Data summaries:", filterCountsData.summaries);
          console.log("Metrics Data summaries:", metricsData.summaries);
          
          // Special handling for search queries
          if (searchQuery && items.length > 0) {
            console.log("Using directly calculated metrics for search in tab summaries");
            
            // We need to get these variables from our earlier calculations
            // Calculate all metrics from the items first, then use them for tab summaries
            
            // Calculate all required values for the search results if they aren't already defined
            // These should have been defined in the code above, but recalculate them here to be safe
            
            // Calculate total value for each tab
            const calcOverviewTotalValue = items.reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            const calcExcessTotalValue = items.filter(i => i.status === 'excess').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            const calcLowStockTotalValue = items.filter(i => i.status === 'low').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            const calcDeadStockTotalValue = items.filter(i => i.status === 'dead').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
            
            // Count distinct branches for each tab
            const calcOverviewBranches = new Set(items.map(item => item.branch)).size;
            const calcExcessBranches = new Set(items.filter(i => i.status === 'excess').map(item => item.branch)).size;
            const calcLowStockBranches = new Set(items.filter(i => i.status === 'low').map(item => item.branch)).size;
            const calcDeadStockBranches = new Set(items.filter(i => i.status === 'dead').map(item => item.branch)).size;
            
            // Calculate inventory turnover for search results if possible, otherwise use API value
            // Simple approximation: if inventory value > 0, calculate turns as COGS/Inventory Value
            let calcOverviewTurnover = 0;
            let calcExcessTurnover = 0;
            let calcLowStockTurnover = 0;
            let calcDeadStockTurnover = 0;
            
            if (calcOverviewTotalValue > 0) {
              // Try to get ttmQtyUsed to calculate a more accurate turnover
              const ttmQtyUsed = items.reduce((sum, item) => sum + (Number(item.ttmQtyUsed) || 0), 0);
              if (ttmQtyUsed > 0) {
                // This is a simplified formula to estimate turnover from search results
                const avgCost = calcOverviewTotalValue / overviewTotalQuantity;
                const annualCogs = ttmQtyUsed * avgCost;
                calcOverviewTurnover = annualCogs / calcOverviewTotalValue;
              } else {
                // Fallback to API value if we can't calculate
                calcOverviewTurnover = metricsData.summaries?.overview?.inventoryTurnover || 0;
              }
            }
            
            // For search, we want the tabSummaries to exactly match our calculated values
            const tabSummariesData = {
              overview: { 
                totalValue: calcOverviewTotalValue, // Use calculated value for search
                totalQuantity: overviewTotalQuantity, // Already defined above
                branchCount: calcOverviewBranches, // Use calculated value for search
                entityCount: calcOverviewBranches > 0 ? 1 : 0, // For search, if we have branches, we have at least one entity
                inventoryTurnover: calcOverviewTurnover
              },
              excess: { 
                totalValue: calcExcessTotalValue, // Use calculated value for search
                totalQuantity: excessTotalQuantity, // Already defined above
                branchCount: calcExcessBranches, // Use calculated value for search
                entityCount: calcExcessBranches > 0 ? 1 : 0, // For search, if we have branches, we have at least one entity
                inventoryTurnover: calcExcessTurnover
              },
              lowStock: { 
                totalValue: calcLowStockTotalValue, // Use calculated value for search
                totalQuantity: lowStockTotalQuantity, // Already defined above
                branchCount: calcLowStockBranches, // Use calculated value for search
                entityCount: calcLowStockBranches > 0 ? 1 : 0, // For search, if we have branches, we have at least one entity
                inventoryTurnover: calcLowStockTurnover
              },
              deadStock: { 
                totalValue: calcDeadStockTotalValue, // Use calculated value for search
                totalQuantity: deadStockTotalQuantity, // Already defined above
                branchCount: calcDeadStockBranches, // Use calculated value for search
                entityCount: calcDeadStockBranches > 0 ? 1 : 0, // For search, if we have branches, we have at least one entity
                inventoryTurnover: calcDeadStockTurnover
              }
            };
            setTabSummaries(tabSummariesData);
          } else {
            // For regular (non-search) views, use the API summaries
            const tabSummariesData = {
              overview: { 
                totalValue: filterCountsData.summaries?.overview?.totalValue || metricsData.summaries?.overview?.totalValue || newMetrics.totalInventoryValue, 
                totalQuantity: filterCountsData.summaries?.overview?.sumOfQuantityOnHand || metricsData.summaries?.overview?.totalQuantity || 0,
                branchCount: filterCountsData.summaries?.overview?.branchCount || metricsData.summaries?.overview?.branchCount || newMetrics.branchCount, 
                entityCount: filterCountsData.summaries?.overview?.entityCount || metricsData.summaries?.overview?.entityCount || newMetrics.entityCount || entities.length, 
                inventoryTurnover: filterCountsData.summaries?.overview?.inventoryTurnover || metricsData.summaries?.overview?.inventoryTurnover || newMetrics.inventoryTurnover 
              },
              excess: { 
                totalValue: filterCountsData.summaries?.excess?.totalValue || metricsData.summaries?.excess?.totalValue || 0, 
                totalQuantity: filterCountsData.summaries?.excess?.sumOfQuantityOnHand || metricsData.summaries?.excess?.totalQuantity || 0,
                branchCount: filterCountsData.summaries?.excess?.branchCount || metricsData.summaries?.excess?.branchCount || newMetrics.branchCount, 
                entityCount: filterCountsData.summaries?.excess?.entityCount || metricsData.summaries?.excess?.entityCount || newMetrics.entityCount || entities.length, 
                inventoryTurnover: filterCountsData.summaries?.excess?.inventoryTurnover || metricsData.summaries?.excess?.inventoryTurnover || 0 
              },
              lowStock: { 
                totalValue: filterCountsData.summaries?.lowStock?.totalValue || metricsData.summaries?.lowStock?.totalValue || 0, 
                totalQuantity: filterCountsData.summaries?.lowStock?.sumOfQuantityOnHand || metricsData.summaries?.lowStock?.totalQuantity || 0,
                branchCount: filterCountsData.summaries?.lowStock?.branchCount || metricsData.summaries?.lowStock?.branchCount || newMetrics.branchCount, 
                entityCount: filterCountsData.summaries?.lowStock?.entityCount || metricsData.summaries?.lowStock?.entityCount || newMetrics.entityCount || entities.length, 
                inventoryTurnover: filterCountsData.summaries?.lowStock?.inventoryTurnover || metricsData.summaries?.lowStock?.inventoryTurnover || 0 
              },
              deadStock: { 
                totalValue: filterCountsData.summaries?.deadStock?.totalValue || metricsData.summaries?.deadStock?.totalValue || 0, 
                totalQuantity: filterCountsData.summaries?.deadStock?.sumOfQuantityOnHand || metricsData.summaries?.deadStock?.totalQuantity || 0,
                branchCount: filterCountsData.summaries?.deadStock?.branchCount || metricsData.summaries?.deadStock?.branchCount || newMetrics.branchCount, 
                entityCount: filterCountsData.summaries?.deadStock?.entityCount || metricsData.summaries?.deadStock?.entityCount || newMetrics.entityCount || entities.length, 
                inventoryTurnover: filterCountsData.summaries?.deadStock?.inventoryTurnover || metricsData.summaries?.deadStock?.inventoryTurnover || 0 
              }
            };
            setTabSummaries(tabSummariesData);
          }
          
          // Debug log the final tab summaries - no need to set tabSummaries again 
          // since we already set it above based on whether it's a search or not
          console.log("Set tab summaries for All Branches complete");
          
          setFilterCounts({
            total: metricsData.totalSKUs || 0,
            excess: metricsData.excessItems || 0,
            low: metricsData.lowStockItems || 0,
            dead: metricsData.deadStockItems || 0,
          });
          
          setLoadingProgress(100);
          clearAllLoadingStates();
          
        } catch (error) {
          console.error('Error fetching all branches with advanced endpoint:', error);
          setError(`Error loading data: ${error.message}`);
          clearAllLoadingStates();
        }
      };
      
      // Use the advanced filters endpoint for All Branches
      fetchAllBranchesWithAdvancedEndpoint();
      return;
    }
    
    // Original condition
    if (filters.advancedFiltersActive || !filters.entity || filters.entity === '' || filters.entity === 'All Entities' || isInitializing) {
      return;
    }

    let timerId = null; 
    const clearManagedLoaders = () => {
      setIsLoadingEntity(false);
      setIsTabChanging(false); 
      setIsFilterCountsLoading(false);
      setLoadingProgress(0); 
    };

    const fetchSpecificEntityBranchData = async () => {
      console.log(`fetchSpecificEntityBranchData triggered for Entity: ${filters.entity}, Branch: ${filters.branch || 'ALL'}, Page: ${currentPage}, Tab: ${activeTab}, Search: "${filters.searchQuery}"`);
      setIsLoadingEntity(true);
      setIsTabChanging(true);
      setIsFilterCountsLoading(true);
      setLoadingProgress(10);
      setError(null); 

      try {
        const entity = filters.entity;
        const branch = filters.branch;
        const searchQuery = filters.searchQuery;
        const statusFilter = activeTab === 'excess' ? 'excess' : activeTab === 'lowStock' ? 'low' : activeTab === 'deadStock' ? 'dead' : null;

        setLastApiCall({ entity, branch: branch || null, page: currentPage }); 

        const offset = (currentPage - 1) * ITEMS_PER_PAGE;
        let itemsApiUrl = `${API_BASE_URL}/inventory/${entity}?limit=${ITEMS_PER_PAGE}&offset=${offset}`;
        const itemsParams = [];
        if (branch) itemsParams.push(`branch=${branch}`);
        if (statusFilter) itemsParams.push(`status=${statusFilter}`);
        if (searchQuery) itemsParams.push(`search=${encodeURIComponent(searchQuery)}`);
        if (networkStatusFilter) itemsParams.push(`network_status=${networkStatusFilter}`);
        itemsParams.push(`sort_by=${sortConfig.key}`);
        itemsParams.push(`sort_dir=${sortConfig.direction === 'ascending' ? 'asc' : 'desc'}`);
        if (itemsParams.length > 0) {
          itemsApiUrl += '&' + itemsParams.join('&');
        }
        
        let metricsApiUrl = `${API_BASE_URL}/metrics/${entity}`;
        if (branch) {
          metricsApiUrl += `?branch=${branch}`; // Corrected line
        }
        
        let filterCountsApiUrl = `${API_BASE_URL}/filtercounts/${entity}`;
        const fcParams = [];
        if (branch) fcParams.push(`branch=${branch}`);
        if (searchQuery) fcParams.push(`search=${encodeURIComponent(searchQuery)}`);
        if (fcParams.length > 0) {
            filterCountsApiUrl += '?' + fcParams.join('&'); // Corrected line
        }
        
        console.log(`  Fetching Items: ${itemsApiUrl}`);
        console.log(`  Fetching Metrics: ${metricsApiUrl}`);
        console.log(`  Fetching FilterCounts: ${filterCountsApiUrl}`);

        const [inventoryResponse, metricsResponse, filterCountsResponse] = await Promise.all([
          fetch(itemsApiUrl),
          fetch(metricsApiUrl),
          fetch(filterCountsApiUrl)
        ]);
        setLoadingProgress(50);
        
        if (!inventoryResponse.ok) throw new Error(`Inventory fetch failed: ${inventoryResponse.statusText} (${itemsApiUrl})`);
        if (!metricsResponse.ok) throw new Error(`Metrics fetch failed: ${metricsResponse.statusText} (${metricsApiUrl})`);
        if (!filterCountsResponse.ok) throw new Error(`FilterCounts fetch failed: ${filterCountsResponse.statusText} (${filterCountsApiUrl})`);

        const inventoryData = await inventoryResponse.json();
        const metricsData = await metricsResponse.json(); 
        const filterCountsData = await filterCountsResponse.json(); 
        setLoadingProgress(70);
        
        setItems(inventoryData.items ? enrichItemsWithMultiBranchInfo(inventoryData.items, globalPartBranchMap) : []);
        setTotalInventoryCount(inventoryData.totalCount || 0); // SKU count for pagination

        const newBranchMetrics = {
          totalSKUs: metricsData.totalSKUs || 0,
          excessItems: metricsData.excessItems || 0,
          lowStockItems: metricsData.lowStockItems || 0,
          deadStockItems: metricsData.deadStockItems || 0,
          totalInventoryValue: metricsData.totalInventoryValue || 0,
          inventoryTurnover: metricsData.inventoryTurnover || metricsData.inventoryTurns || 0
        };
        setMetrics(newBranchMetrics); 
        setBranchMetrics(newBranchMetrics);
          
        setFilterCounts({ // SKU Counts
          overview: filterCountsData.overviewItems || filterCountsData.totalItems || (inventoryData.totalCount || 0),
          excess: filterCountsData.excessItems || 0,
          lowStock: filterCountsData.lowStockItems || 0,
          deadStock: filterCountsData.deadStockItems || 0
        });

        if (filterCountsData.summaries) {
          const updatedSummaries = {};
          for (const tabKey in filterCountsData.summaries) {
            updatedSummaries[tabKey] = {
              ...filterCountsData.summaries[tabKey],
              // The API directly provides totalQuantity in its summaries for physical stock sum
              totalQuantity: filterCountsData.summaries[tabKey]?.totalQuantity || 0 
            };
          }
          setTabSummaries(updatedSummaries);
        } else {
          console.warn("filterCountsData.summaries missing in fetchSpecificEntityBranchData. Sum of physical stock in summary will be based on current page's items only.");
          const itemsForSummary = inventoryData.items || [];
          const currentBranchCount = branch ? 1 : (entity ? (new Set(itemsForSummary.map(i => i.branch))).size : 0);
          const sumQuantityByStatus = (status) => itemsForSummary.filter(i => i.status === status).reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
          
          setTabSummaries({
            overview: {
                totalValue: newBranchMetrics.totalInventoryValue, 
                totalQuantity: itemsForSummary.reduce((sum, item) => sum + (item.quantityOnHand || 0), 0), 
                branchCount: currentBranchCount, 
                inventoryTurnover: newBranchMetrics.inventoryTurnover 
            },
            excess: {
                totalValue: filterCountsData.excessValue || 0, 
                totalQuantity: sumQuantityByStatus('excess'), 
                branchCount: currentBranchCount, 
                inventoryTurnover: filterCountsData.excessInventoryTurnover || 0 
            },
            lowStock: {
                totalValue: filterCountsData.lowStockValue || 0, 
                totalQuantity: sumQuantityByStatus('low'), 
                branchCount: currentBranchCount, 
                inventoryTurnover: filterCountsData.lowStockInventoryTurnover || 0 
            },
            deadStock: {
                totalValue: filterCountsData.deadValue || 0, 
                totalQuantity: sumQuantityByStatus('dead'), 
                branchCount: currentBranchCount, 
                inventoryTurnover: filterCountsData.deadInventoryTurnover || 0 
            }
          });
        }
        
        setLoadingProgress(100);
        if (timerId) clearTimeout(timerId); 
        timerId = setTimeout(clearManagedLoaders, 1000);

      } catch (error) {
        console.error("Error fetching specific entity/branch data:", error.message);
        setError(error.message || 'Failed to fetch specific entity/branch data');
        setItems([]);
        setTotalInventoryCount(0);
        setMetrics({ totalSKUs: 0, excessItems: 0, lowStockItems: 0, deadStockItems: 0, totalInventoryValue: 0, inventoryTurnover: 0 });
        setFilterCounts({ overview: 0, excess: 0, lowStock: 0, deadStock: 0 });
        setTabSummaries({ overview: null, excess: null, lowStock: null, deadStock: null });
        if (timerId) clearTimeout(timerId); 
        timerId = setTimeout(clearManagedLoaders, 1000); 
      }
    };

    fetchSpecificEntityBranchData();

    return () => { 
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [filters.entity, filters.branch, filters.searchQuery, activeTab, isInitializing, currentPage, sortConfig, networkStatusFilter]);
  
  // This effect is responsible for sorting and filtering the displayed items
  // IMPORTANT: Always prioritize MB parts in sorting
  useEffect(() => {
    if (isLoadingEntity && activeTab === filters.activeTab) {
      return;
    }
    if (items.length === 0) {
      setFilteredItems([]);
      return;
    }
    let sorted = [...items];
    if (sortConfig.key === 'monthsOfCoverage') {
      // Import getSortableCoverageValue from InventoryTable
      const getSortableCoverageValue = (value) => {
        if (value === "Infinity" || value === Infinity) return Number.POSITIVE_INFINITY;
        const num = Number(value);
        return isNaN(num) ? -Infinity : num;
      };
      sorted.sort((a, b) => {
        const aVal = getSortableCoverageValue(a.monthsOfCoverage);
        const bVal = getSortableCoverageValue(b.monthsOfCoverage);
        return sortConfig.direction === 'ascending' ? aVal - bVal : bVal - aVal;
      });
    } else {
      // Existing sorting logic for other columns (if any)
    }
    setFilteredItems(sorted);
    if (isFilterCountsLoading) {
      setIsFilterCountsLoading(false);
    }
  }, [items, sortConfig, activeTab, isLoadingEntity, filters.activeTab, activeTab]);
  
  // For tracking tab change loading state
  // const [isTabChanging, setIsTabChanging] = useState(false); // Already declared above
  
  // For tracking if the filter counts are loading
  // const [isFilterCountsLoading, setIsFilterCountsLoading] = useState(false); // Already declared above
  
  // For tracking real loading progress (0-100) 
  // const [loadingProgress, setLoadingProgress] = useState(0); // Already declared above
  
  // Handle tab changes - need to reload filtered data for the tab
  // but keep the KeyMetrics data constant for the selected branch
  const handleTabChange = (tab) => {
    if (tab === activeTab) return;
    
    setCurrentPage(1); // Reset page on tab change

    setIsLoadingEntity(true);
    setIsTabChanging(true);
    setIsFilterCountsLoading(true);
    setLoadingProgress(5); 
    
    setActiveTab(tab);
    
    setFilters(prev => ({
      ...prev,
      activeTab: tab
      // searchQuery is no longer cleared here, it will persist across tabs
    }));

    // The main useEffect hooks (for "All Branches" or specific entity)
    // that depend on 'activeTab' and 'currentPage' will handle data fetching.
  };
  
  // Handle filter changes - making it work like advanced filters
  const handleFilterChange = (name, value) => {
    if (name === 'entity') {
      setCurrentPage(1); // Reset page on entity change
      setLastApiCall({ entity: value, branch: null, page: 1 }); // Include page
      setIsLoadingEntity(true);
      setIsTabChanging(true);
      setIsFilterCountsLoading(true);
      setLoadingProgress(5);
      setFilters(prev => ({
        ...prev,
        entity: value,
        branch: '', // Reset branch when entity changes
        searchQuery: '' // Clear search when entity changes
      }));
    } else if (name === 'branch') {
      setCurrentPage(1); // Reset page on branch change
      setLastApiCall(prev => ({ ...prev, branch: value, page: 1 }));
      setIsLoadingEntity(true);
      setIsTabChanging(true);
      setIsFilterCountsLoading(true);
      setLoadingProgress(5);
      setFilters(prev => ({
        ...prev,
        branch: value,
        searchQuery: '' // Clear search when branch changes
      }));
    } else if (name === 'searchQuery') {
      setFilters(prev => ({ ...prev, [name]: value }));
      if (value === '') {
        handleSearchSubmit(''); // This will also reset page to 1
      }
    } else {
      setFilters(prev => ({ ...prev, [name]: value }));
      // Do NOT clear searchQuery when switching tabs or other filters
    }
  };
  
  // Handle sorting
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1); // Reset to first page on sort
  };

  // Handle view item - find the same part across all branches
  const handleViewItem = (item) => {
    if (!items || items.length === 0) return;
    
    // Set the selected item first
    setSelectedItem(item);
    
    // Modified approach: Try to fetch part details, but also use a more robust fallback strategy
    const fetchPartDetailsAcrossBranches = async () => {
      try {
        // First try using the API endpoints
        console.log(`Attempting to fetch part details for ${item.partNumber} across all branches`);
        const response = await fetch(`${API_BASE_URL}/part-details/all/${item.partNumber}`);
        
        if (!response.ok) {
          console.log("Falling back to entity-specific part details endpoint");
          const fallbackResponse = await fetch(`${API_BASE_URL}/part-details/${item.entity}/${item.partNumber}`);
          
          if (!fallbackResponse.ok) {
            console.log("Trying generic inventory search for this part number as further fallback");
            const searchResponse = await fetch(`${API_BASE_URL}/inventory/search?term=${encodeURIComponent(item.partNumber)}`);
            
            if (!searchResponse.ok) {
              throw new Error(`Generic inventory search failed: ${searchResponse.statusText} (after other fallbacks)`);
            }
            const searchData = await searchResponse.json();
            if (searchData && searchData.items && Array.isArray(searchData.items)) {
              const exactMatches = searchData.items.filter(searchItem => searchItem.partNumber === item.partNumber);
              if (exactMatches.length > 0) {
                console.log(`Found ${exactMatches.length} branches with this part via generic search`);
                setItemBranchDetails(exactMatches);
                return;
              }
            }
            throw new Error(`Generic inventory search yielded no exact matches (after other fallbacks).`);
          }
          const fallbackData = await fallbackResponse.json();
          setItemBranchDetails(fallbackData);
          return;
        }
        const detailsData = await response.json();
        console.log("Fetched part details across ALL branches via primary API:", detailsData.length);
        setItemBranchDetails(detailsData);
        
      } catch (error) { // Single catch block for all primary and chained fallback API attempts
        console.error('Error fetching part details via APIs:', error.message);
        console.log('Attempting mock data or local item as final fallback.');
        
        // Fallback STRATEGY: Check if we can use mock data
          if (mockItems && mockItems.length > 0) {
          const partMatchesInMock = mockItems.filter(mockItem => mockItem.partNumber === item.partNumber);
          if (partMatchesInMock.length > 0) {
            console.log(`Found ${partMatchesInMock.length} branches with this part in mock data.`);
            setItemBranchDetails(partMatchesInMock);
              return;
            }
          }
          
        // Ultimate fallback: If we couldn't find it in mock data or APIs, use only the current item
        console.log('Using only the current selected item as final resort for details modal.');
          setItemBranchDetails([item]);
      }
    };
    
    // Start with current item as fallback
    setItemBranchDetails([item]);
    
    // Then try to get additional details
    fetchPartDetailsAcrossBranches();
    
    // Open the modal
    setModalIsOpen(true);
  };
  
  // Close modal
  const handleCloseModal = () => {
    setModalIsOpen(false);
  };
  
  // Open/close cart modals
  const handleOpenOrderCart = () => {
    setOrderCartOpen(true);
    setTransferCartOpen(false);
  };
  
  const handleOpenTransferCart = () => {
    setOrderCartOpen(false);
    setTransferCartOpen(true);
  };
  
  const handleCloseCartModal = () => {
    setOrderCartOpen(false);
    setTransferCartOpen(false);
    // Do not close CartReviewModal here, it has its own handler
  };
  
  const handleOpenCartReviewModal = (type) => {
    setCartViewType(type);
    setIsCartReviewModalOpen(true);
  };

  const handleCloseCartReviewModal = () => {
    setIsCartReviewModalOpen(false);
  };
  
  // Advanced filters handlers
  const handleOpenAdvancedFilters = () => {
    setAdvancedFiltersOpen(true);
  };
  
  const handleCloseAdvancedFilters = () => {
    setAdvancedFiltersOpen(false);
    // Make sure any stray loading states are cleared
    clearAllLoadingStates();
  };
  
  const handleApplyAdvancedFilters = (advancedFilters) => {
    setCurrentPage(1); // Reset page when new advanced filters are applied

    let firstBranch = null;
    if (!advancedFilters.showAllBranches) {
      for (const entity of advancedFilters.selectedEntities || []) {
        if (advancedFilters.selectedBranches[entity]?.length > 0) {
          firstBranch = advancedFilters.selectedBranches[entity][0];
          break;
        }
      }
    }
    
    setLastApiCall({ 
      entity: 'advanced-filters', 
      branch: firstBranch,
      page: 1 // Include page in lastApiCall
    });
    
    console.log(`User applied advanced filters with ${firstBranch ? 'branch ' + firstBranch : 'no specific branch'} - waiting for matching API data (page 1)`);
    setIsLoadingEntity(true);
    setIsTabChanging(true);
    setIsFilterCountsLoading(true);
    setLoadingProgress(5); 
    
    setFilters(prev => ({
      ...prev,
      advancedFilters,
      advancedFiltersActive: true,
      entity: '',
      branch: ''
    }));
    
    setBranchMetrics({
      totalSKUs: 0,
      excessItems: 0,
      lowStockItems: 0,
      deadStockItems: 0,
      totalInventoryValue: 0,
      inventoryTurnover: 0
    });
  };

  // useEffect for advanced filters - needs currentPage in dependency and usage
  useEffect(() => {
    if (filters.advancedFiltersActive && filters.advancedFilters) {
      setIsLoadingEntity(true);
      setIsFilterCountsLoading(true);
      setLoadingProgress(10); // Initial progress for advanced filter fetch
      
      const fetchAdvancedFilteredData = async () => {
        console.log(`Fetching advanced filtered data, page: ${currentPage}, filters:`, filters.advancedFilters);
        try {
          const { selectedEntities, selectedBranches, showAllBranches } = filters.advancedFilters;
          if (!selectedEntities || selectedEntities.length === 0) { /* ... return early ... */ return; }
          let selectedBranchList = []; /* ... populate selectedBranchList ... */
          if (!showAllBranches) {
            for (const entity of selectedEntities) {
              if (selectedBranches[entity] && selectedBranches[entity].length > 0) {
                selectedBranchList = [...selectedBranchList, ...selectedBranches[entity]];
              }
            }
          }
          const statusFilter = activeTab === 'excess' ? 'excess' : activeTab === 'lowStock' ? 'low' : activeTab === 'deadStock' ? 'dead' : null;

          // Metrics URL construction for advanced filters
          let metricsUrl = `${API_BASE_URL}/metrics/advanced`;
          
          // Add entities parameter - comma-separated list of selected entities
          if (selectedEntities.length > 0) {
            metricsUrl += `${metricsUrl.includes('?') ? '&' : '?'}entities=${selectedEntities.join(',')}`;
          }
          
          // Add branches parameter if specific branches are selected
          if (!showAllBranches && selectedBranchList.length > 0) {
            metricsUrl += `${metricsUrl.includes('?') ? '&' : '?'}branches=${selectedBranchList.join(',')}`;
          }
          
          // Add status filter if applicable
          if (statusFilter) {
            metricsUrl += `${metricsUrl.includes('?') ? '&' : '?'}status_filter=${statusFilter}`;
          }

          // Inventory data URL construction - NEEDS PAGINATION
          const offset = (currentPage - 1) * ITEMS_PER_PAGE;
          const limit = ITEMS_PER_PAGE;
          let dataUrl = '';
          
          // Use the dedicated /inventory/advanced endpoint for advanced filters
          dataUrl = `${API_BASE_URL}/inventory/advanced?limit=${limit}&offset=${offset}`;
          
          // Add entities parameter - comma-separated list of selected entities
          if (selectedEntities.length > 0) {
            dataUrl += `&entities=${selectedEntities.join(',')}`;
          }
          
          // Add branches parameter if specific branches are selected
          if (!showAllBranches && selectedBranchList.length > 0) {
            dataUrl += `&branches=${selectedBranchList.join(',')}`;
          }
          
          // Add search parameter if there's a search query
          if (filters.searchQuery) {
            dataUrl += `&search=${encodeURIComponent(filters.searchQuery)}`;
          }
          
          // Add status filter if applicable
          if (statusFilter) {
            dataUrl += `&status=${statusFilter}`;
          }
          dataUrl += `&sort_by=${sortConfig.key}&sort_dir=${sortConfig.direction === 'ascending' ? 'asc' : 'desc'}`;

          // ... (fetch metricsResponse as before) ...
          // ... (fetch dataResponse using the paginated dataUrl) ...
          const metricsResponse = await fetch(metricsUrl);
          const dataResponse = dataUrl ? await fetch(dataUrl) : Promise.resolve({ ok: true, json: async () => ({ items: [], totalCount: 0 }) });

          if (!metricsResponse.ok) throw new Error(`Failed to fetch advanced metrics: ${metricsResponse.statusText}`);
          if (!dataResponse.ok) throw new Error(`Failed to fetch advanced display data: ${dataResponse.statusText}`);
          
          let metricsData = await metricsResponse.json();
          console.log("ADVANCED FILTERS - Raw metricsData from /metrics/advanced:", JSON.stringify(metricsData, null, 2)); // DIAGNOSTIC LOG 1
          let displayData = await dataResponse.json();

          setTotalInventoryCount(displayData.totalCount || 0); // Update total count for pagination
          
          // ... (rest of processing: setItems, setMetrics, setFilteredCounts, setTabSummaries, setBranchMetrics, clearAllLoadingStates) ...
          // Make sure to use displayData.items and displayData.totalCount appropriately.

        } catch (error) {
          console.error('Error fetching advanced filtered data:', error);
          setError(`Error loading advanced filtered data: ${error.message}`);
          setTotalInventoryCount(0); // Reset on error
          clearAllLoadingStates(); // Ensure loaders are cleared on error
        }
      };
      
      fetchAdvancedFilteredData();
      return; // Already handled advanced filters
    }
  }, [filters.advancedFiltersActive, filters.advancedFilters, activeTab, currentPage, filters.searchQuery, networkStatusFilter]); // MODIFIED: Added currentPage and filters.searchQuery
  
  // Handle adding item to cart (either for order or transfer)
  const handleAddToCart = async (item, type, quantity, arg4, arg5, arg6, arg7) => {
    // arg4 can be sourceBranch (for transfer) or null (for order initially, then vendorName)
    // arg5 can be destinationBranch (for transfer) or vendorName (for order)
    // arg6 can be notes (for transfer or order)
    // arg7 can be requestingBranch (for order)

    if (type === 'order') {
      const vendorName = arg5; // If order, 5th param from ItemDetailModal is vendorName
      const notes = arg6;      // If order, 6th param is notes
      const requestingBranch = arg7 || item.branch; // If order, 7th param is requestingBranch

      // Use database-backed cart system
      console.log('Adding order to cart. Item:', item, 'Vendor:', vendorName);
      await addToActiveCart('orders', {
        partNumber: item.mfgPartNumber,
        internalPartNumber: item.partNumber,
        description: item.description,
        quantity: parseInt(quantity, 10),
        vendorName,
        notes,
        requestingBranch
      });
    } else if (type === 'transfer') {
      const sourceBranch = arg4;         // If transfer, 4th param from ItemDetailModal is sourceBranch
      const destinationBranch = arg5;    // If transfer, 5th param is destinationBranch
      const notes = arg6;                // If transfer, 6th param is notes

      // Use database-backed cart system
      console.log('Adding transfer to cart. Item:', item, 'Source:', sourceBranch, 'Dest:', destinationBranch);
      await addToActiveCart('transfers', {
        partNumber: item.mfgPartNumber,
        internalPartNumber: item.partNumber,
        description: item.description,
        quantity: parseInt(quantity, 10),
        sourceBranch,
        destinationBranch,
        notes
      });
    }
    
    // Show success message
    setRequestStatus({
      isSubmitting: false,
      message: `${item.mfgPartNumber || item.partNumber || 'Item'} added to ${type} cart`,
      type: 'success'
    });
    
    // Clear message after 3 seconds
    setTimeout(() => {
      setRequestStatus({
        isSubmitting: false,
        message: '',
        type: ''
      });
    }, 3000);
  };
  
  // Remove item from cart
  const handleRemoveFromCart = (itemId, cartType) => {
    const cartKey = cartType === 'order' ? 'orders' : 'transfers';
    setCart(prev => ({
      ...prev,
      [cartKey]: prev[cartKey].filter(item => item.id !== itemId)
    }));
  };
  
  // Handle submission of cart items
  // This function now has dual functionality:
  // 1. When called from ItemDetailModal, it navigates to the appropriate cart
  // 2. When called from CartModal, it actually submits the request
  const handleSubmitRequest = async (type, action) => { // Added 'action' parameter
    const userEmail = getUserEmail();
    if (!userEmail) {
      setRequestStatus({ isSubmitting: false, message: 'User email not available.', type: 'error' });
      return;
    }

    if (type === 'orders' && action === 'teams') {
      if (!cart.orders || cart.orders.length === 0) {
        setRequestStatus({ isSubmitting: false, message: 'Order cart is empty.', type: 'info' });
        return;
      }
      setRequestStatus({ isSubmitting: true, message: 'Submitting active orders...', type: 'info' });

      try {
        console.log("Submitting active orders to backend for user:", userEmail);
        const response = await fetch(`${API_BASE_URL}/submit-active-orders?user_email=${encodeURIComponent(userEmail)}`, {
          method: 'POST'
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: 'Failed to submit active orders. Unknown error.' }));
          throw new Error(errorData.detail || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        console.log('Active orders submitted successfully:', result);
        setRequestStatus({ isSubmitting: false, message: 'Orders submitted. Preparing Teams message...', type: 'info' });

        // 2. Format for Teams and open deep link (using current cart before clearing)
        const { subject, messageBody } = formatOrderForTeams(cart.orders, userEmail);
        const teamsLink = generateTeamsDeepLink(subject, messageBody);
        
        window.open(teamsLink, '_blank');

        // 3. Clear the order cart and reload from database
        await loadActiveCartFromDatabase();
        setRequestStatus({ isSubmitting: false, message: 'Order logged and Teams chat opened!', type: 'success' });
        
        // Optionally, close the CartReviewModal after successful submission and Teams link opening
        // handleCloseCartReviewModal(); 

      } catch (error) {
        console.error('Failed to submit order and open Teams:', error);
        setRequestStatus({ isSubmitting: false, message: `Error: ${error.message}`, type: 'error' });
      }

    } else if (type === 'transfers' && action === 'teams') {
      if (!cart.transfers || cart.transfers.length === 0) {
        setRequestStatus({ isSubmitting: false, message: 'Transfer cart is empty.', type: 'info' });
        return;
      }
      setRequestStatus({ isSubmitting: true, message: 'Submitting active transfers...', type: 'info' });

      try {
        console.log("Submitting active transfers to backend for user:", userEmail);
        const response = await fetch(`${API_BASE_URL}/submit-active-transfers?user_email=${encodeURIComponent(userEmail)}`, {
          method: 'POST'
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: 'Failed to submit active transfers. Unknown error.' }));
          throw new Error(errorData.detail || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        console.log('Active transfers submitted successfully:', result);
        setRequestStatus({ isSubmitting: false, message: 'Transfers submitted. Preparing Teams message...', type: 'info' });

        // Format for Teams and open deep link
        const { subject, messageBody } = formatTransferForTeams(cart.transfers, userEmail);
        const teamsLink = generateTeamsDeepLink(subject, messageBody);
        
        window.open(teamsLink, '_blank');

        // Clear the transfer cart and reload from database
        await loadActiveCartFromDatabase();
        setRequestStatus({ isSubmitting: false, message: 'Transfers logged and Teams chat opened!', type: 'success' });

      } catch (error) {
        console.error('Transfer submission error:', error);
        setRequestStatus({ isSubmitting: false, message: `Failed to submit transfers: ${error.message}`, type: 'error' });
      }
    } else {
      setRequestStatus({ isSubmitting: false, message: 'Unknown request type or action.', type: 'info' });
    }
  };

  // Helper to format order details for Teams message
  const formatOrderForTeams = (orders, userEmail) => {
    const today = new Date().toISOString().split('T')[0];
    // Assuming all orders in a single submission are for the same primary requesting branch for the subject
    // Or we can make the subject more generic if orders can be for mixed branches in one cart.
    // For now, let's try to pick the first one if available.
    const firstRequestingBranch = orders.length > 0 ? orders[0].requestingBranch : 'Multiple Branches';
    const subject = `ORDER REQUEST - ${today} - For Branch: ${firstRequestingBranch}`;

    let messageBody = `Please process the following order request:\n\n`;
    messageBody += orders.map((order, index) => {
      return `-----------------------------------\nItem ${index + 1}:\n  MFG Part #: ${order.item.mfgPartNumber}\n` +
             (order.item.partNumber ? `  Internal Part #: ${order.item.partNumber}\n` : '') +
             `  Description: ${order.item.description || 'N/A'}\n` +
             `  Quantity: ${order.quantity}\n` +
             `  Vendor: ${order.vendorName || 'N/A'}\n` +
             `  Requesting Branch: ${order.requestingBranch || 'N/A'}\n` +
             (order.notes ? `  Notes: ${order.notes}\n` : '');
    }).join('\n');
    messageBody += `-----------------------------------\nTotal Items: ${orders.length}\n`;
    if (userEmail) {
      messageBody += `Requested by: ${userEmail}\n`;
    }
    messageBody += `\nThank you.`;

    return { subject, messageBody };
  };

  // Helper to format transfer details for Teams message
  const formatTransferForTeams = (transfers, userEmail) => {
    const today = new Date().toISOString().split('T')[0];
    const firstSourceBranch = transfers.length > 0 ? transfers[0].sourceBranch : 'Multiple Sources';
    const firstDestBranch = transfers.length > 0 ? transfers[0].destinationBranch : 'Multiple Destinations';
    const subject = `TRANSFER REQUEST - ${today} - From: ${firstSourceBranch} To: ${firstDestBranch}`;

    let messageBody = `Please process the following transfer request:\n\n`;
    messageBody += transfers.map((transfer, index) => {
      return `-----------------------------------\nItem ${index + 1}:\n  MFG Part #: ${transfer.partNumber}\n` +
             (transfer.internalPartNumber ? `  Internal Part #: ${transfer.internalPartNumber}\n` : '') +
             `  Description: ${transfer.description || 'N/A'}\n` +
             `  Quantity: ${transfer.quantity}\n` +
             `  From Branch: ${transfer.sourceBranch}\n` +
             `  To Branch: ${transfer.destinationBranch}\n` +
             (transfer.notes ? `  Notes: ${transfer.notes}\n` : '');
    }).join('\n');
    messageBody += `-----------------------------------\nTotal Items: ${transfers.length}\n`;
    if (userEmail) {
      messageBody += `Requested by: ${userEmail}\n`;
    }
    messageBody += `\nThank you.`;

    return { subject, messageBody };
  };

  // Helper to generate Teams deep link
  const generateTeamsDeepLink = (subject, message) => {
    const encodedSubject = encodeURIComponent(subject);
    const encodedMessage = encodeURIComponent(message);
    // Leaving users parameter empty so user can choose recipients
    return `https://teams.microsoft.com/l/chat/0/0?users=&topicName=${encodedSubject}&message=${encodedMessage}`;
  };

  // Add CSS for loading cursor and data loading overlay
  // We don't need the global loading overlay and cursor anymore
  // Just relying on component-specific loading states

  // NEW: Function to handle explicit search submission
  const handleSearchSubmit = async (submittedQuery) => {
    setCurrentPage(1); 
    setFilters(prevFilters => ({ ...prevFilters, searchQuery: submittedQuery }));

    console.log('Search submitted with query:', submittedQuery, 'for page: 1');
    setError(null);
    setIsLoadingEntity(true);
    setIsTabChanging(true); 
    setIsFilterCountsLoading(true);
    setLoadingProgress(10);

    const offset = 0; 
    const limit = ITEMS_PER_PAGE;
    let timerId = null; 
    const clearManagedLoaders = () => {
        setIsLoadingEntity(false);
        setIsTabChanging(false);
        setIsFilterCountsLoading(false);
        setLoadingProgress(0);
    };


    if (!filters.entity && !filters.advancedFiltersActive) { // "All Branches" Search
      console.log('Performing search for All Branches with query:', submittedQuery, `limit: ${limit}, offset: ${offset}`);
      try {
        const statusFilter = activeTab === 'excess' ? 'excess' : activeTab === 'lowStock' ? 'low' : activeTab === 'deadStock' ? 'dead' : null;
        const inventoryUrl = `${API_BASE_URL}/inventory?limit=${limit}&offset=${offset}${statusFilter ? `&status=${statusFilter}` : ''}${submittedQuery ? `&search=${encodeURIComponent(submittedQuery)}` : ''}&sort_by=${sortConfig.key}&sort_dir=${sortConfig.direction === 'ascending' ? 'asc' : 'desc'}`;
        const metricsPath = `${API_BASE_URL}/metrics/all/complete${submittedQuery ? `?search=${encodeURIComponent(submittedQuery)}` : ''}`;
        const filterCountsPath = `${API_BASE_URL}/filtercounts/all${submittedQuery ? `?search=${encodeURIComponent(submittedQuery)}` : ''}`;
        
        // Also use the advanced metrics endpoint for more accurate data particularly for search results
        let advancedMetricsUrl = `${API_BASE_URL}/metrics/advanced?entities=${entities.join(',')}`;
        if (statusFilter) advancedMetricsUrl += `&status=${statusFilter}`;
        if (submittedQuery) advancedMetricsUrl += `&search=${encodeURIComponent(submittedQuery)}`;
        
        console.log(`Search query submitted: "${submittedQuery}"`);
        console.log(`Using advanced metrics endpoint: ${advancedMetricsUrl}`);

        const [metricsResponse, filterCountsResponse, inventoryResponse, advancedMetricsResponse] = await Promise.all([
          fetch(metricsPath),
          fetch(filterCountsPath),
          fetch(inventoryUrl),
          fetch(advancedMetricsUrl)
        ]);
        setLoadingProgress(40); 

        if (!metricsResponse.ok || !filterCountsResponse.ok || !inventoryResponse.ok || !advancedMetricsResponse.ok) {
          let errorMsg = "Failed to fetch search data for All Branches:";
          if (!metricsResponse.ok) errorMsg += ` Metrics: ${metricsResponse.statusText} (${metricsPath}).`;
          if (!filterCountsResponse.ok) errorMsg += ` FilterCounts: ${filterCountsResponse.statusText} (${filterCountsPath}).`;
          if (!inventoryResponse.ok) errorMsg += ` Inventory: ${inventoryResponse.statusText} (${inventoryUrl}).`;
          if (!advancedMetricsResponse.ok) errorMsg += ` Advanced Metrics: ${advancedMetricsResponse.statusText} (${advancedMetricsUrl}).`;
          throw new Error(errorMsg);
        }

        const metricsData = await metricsResponse.json();
        const filterCountsData = await filterCountsResponse.json();
        const inventoryData = await inventoryResponse.json();
        const advancedMetricsData = await advancedMetricsResponse.json();
        setLoadingProgress(70);
        
        // Log all the data sources for debugging
        console.log("Search results - filter counts data:", filterCountsData);
        console.log("Search results - advanced metrics data:", advancedMetricsData);

        setTotalInventoryCount(inventoryData.totalCount || 0); // SKU count for pagination

        const processedMetrics = {
          totalSKUs: metricsData.totalSKUs || metricsData.total_skus || 0,
          excessItems: metricsData.excessItems || metricsData.excess_items || 0,
          lowStockItems: metricsData.lowStockItems || metricsData.low_stock_items || 0,
          deadStockItems: metricsData.deadStockItems || metricsData.dead_stock_items || 0,
          totalInventoryValue: metricsData.totalInventoryValue || metricsData.total_inventory_value || 0,
          inventoryTurnover: metricsData.inventoryTurnover || metricsData.inventory_turnover || 0,
          entityCount: metricsData.entityCount || metricsData.entity_count || entities.length,
          branchCount: metricsData.branchCount || metricsData.branch_count || 0
        };
        setMetrics(processedMetrics);
        setBranchMetrics(processedMetrics); 

        // Calculate total inventory quantity based on search results
        // First check if we can get it from the API response
        let overviewTotalQuantity = 0;
        let excessTotalQuantity = 0;
        let lowStockTotalQuantity = 0;
        let deadStockTotalQuantity = 0;
        
        // If searched for a specific part number, try to calculate the totals directly from the inventory items
        // This should give the most accurate results for a specific part search
        if (submittedQuery && inventoryData.items && inventoryData.items.length > 0) {
          console.log("PART NUMBER SEARCH: Calculating totalQuantity directly from items");
          const items = inventoryData.items || [];
          
          // Sum all quantities for all found items
          const totalQtySum = items.reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
          console.log(`Total quantity sum from items: ${totalQtySum} for ${items.length} items`);
          
          // Set values for all tabs based on item statuses
          overviewTotalQuantity = totalQtySum;
          excessTotalQuantity = items.filter(i => i.status === 'excess').reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
          lowStockTotalQuantity = items.filter(i => i.status === 'low').reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
          deadStockTotalQuantity = items.filter(i => i.status === 'dead').reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
          
          console.log("Part number search quantities:", {
            overview: overviewTotalQuantity,
            excess: excessTotalQuantity,
            lowStock: lowStockTotalQuantity,
            deadStock: deadStockTotalQuantity
          });
        }
        // If not a specific search or no items found, try using APIs
        else {
          // Try to get quantities from the advanced metrics first
          if (advancedMetricsData.summaries) {
            console.log("Using advanced metrics summaries for totalQuantity");
            overviewTotalQuantity = advancedMetricsData.summaries.overview?.totalQuantity || 0;
            excessTotalQuantity = advancedMetricsData.summaries.excess?.totalQuantity || 0;
            lowStockTotalQuantity = advancedMetricsData.summaries.lowStock?.totalQuantity || 0;
            deadStockTotalQuantity = advancedMetricsData.summaries.deadStock?.totalQuantity || 0;
          }
          
          // Fallback to filter counts if advanced metrics didn't have it
          if (overviewTotalQuantity === 0 && filterCountsData.summaries) {
            console.log("Using filter counts summaries for totalQuantity");
            overviewTotalQuantity = filterCountsData.summaries.overview?.sumOfQuantityOnHand || 0;
            excessTotalQuantity = filterCountsData.summaries.excess?.sumOfQuantityOnHand || 0;
            lowStockTotalQuantity = filterCountsData.summaries.lowStock?.sumOfQuantityOnHand || 0;
            deadStockTotalQuantity = filterCountsData.summaries.deadStock?.sumOfQuantityOnHand || 0;
          }
          
          // If still no data and we have items, calculate from them
          if (overviewTotalQuantity === 0 && inventoryData.items && inventoryData.items.length > 0) {
            console.log("Calculating totalQuantity from items (fallback)");
            const items = inventoryData.items || [];
            overviewTotalQuantity = items.reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
            excessTotalQuantity = items.filter(i => i.status === 'excess').reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
            lowStockTotalQuantity = items.filter(i => i.status === 'low').reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
            deadStockTotalQuantity = items.filter(i => i.status === 'dead').reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);
          }
        }
        
        console.log("Final totalQuantity values for tabs:", {
          overview: overviewTotalQuantity,
          excess: excessTotalQuantity,
          lowStock: lowStockTotalQuantity,
          deadStock: deadStockTotalQuantity
        });

        const tabSummariesData = {
          overview: { 
            totalValue: filterCountsData.summaries?.overview?.totalValue || advancedMetricsData.summaries?.overview?.totalValue || processedMetrics.totalInventoryValue, 
            totalQuantity: overviewTotalQuantity,
            branchCount: filterCountsData.summaries?.overview?.branchCount || advancedMetricsData.summaries?.overview?.branchCount || processedMetrics.branchCount, 
            entityCount: filterCountsData.summaries?.overview?.entityCount || advancedMetricsData.summaries?.overview?.entityCount || processedMetrics.entityCount || entities.length, 
            inventoryTurnover: filterCountsData.summaries?.overview?.inventoryTurnover || advancedMetricsData.summaries?.overview?.inventoryTurnover || processedMetrics.inventoryTurnover 
          },
          excess: { 
            totalValue: filterCountsData.summaries?.excess?.totalValue || advancedMetricsData.summaries?.excess?.totalValue || 0, 
            totalQuantity: excessTotalQuantity,
            branchCount: filterCountsData.summaries?.excess?.branchCount || advancedMetricsData.summaries?.excess?.branchCount || processedMetrics.branchCount, 
            entityCount: filterCountsData.summaries?.excess?.entityCount || advancedMetricsData.summaries?.excess?.entityCount || processedMetrics.entityCount || entities.length, 
            inventoryTurnover: filterCountsData.summaries?.excess?.inventoryTurnover || advancedMetricsData.summaries?.excess?.inventoryTurnover || 0 
          },
          lowStock: { 
            totalValue: filterCountsData.summaries?.lowStock?.totalValue || advancedMetricsData.summaries?.lowStock?.totalValue || 0, 
            totalQuantity: lowStockTotalQuantity,
            branchCount: filterCountsData.summaries?.lowStock?.branchCount || advancedMetricsData.summaries?.lowStock?.branchCount || processedMetrics.branchCount, 
            entityCount: filterCountsData.summaries?.lowStock?.entityCount || advancedMetricsData.summaries?.lowStock?.entityCount || processedMetrics.entityCount || entities.length, 
            inventoryTurnover: filterCountsData.summaries?.lowStock?.inventoryTurnover || advancedMetricsData.summaries?.lowStock?.inventoryTurnover || 0 
          },
          deadStock: { 
            totalValue: filterCountsData.summaries?.deadStock?.totalValue || advancedMetricsData.summaries?.deadStock?.totalValue || 0, 
            totalQuantity: deadStockTotalQuantity,
            branchCount: filterCountsData.summaries?.deadStock?.branchCount || advancedMetricsData.summaries?.deadStock?.branchCount || processedMetrics.branchCount, 
            entityCount: filterCountsData.summaries?.deadStock?.entityCount || advancedMetricsData.summaries?.deadStock?.entityCount || processedMetrics.entityCount || entities.length, 
            inventoryTurnover: filterCountsData.summaries?.deadStock?.inventoryTurnover || advancedMetricsData.summaries?.deadStock?.inventoryTurnover || 0 
          }
        };
        
        console.log("Final tab summaries for search:", tabSummariesData);
        
        // Make sure we're updating the state with the new data
        // Use a functional update to guarantee we're replacing the previous state
        setTabSummaries(prev => {
          console.log("Previous tab summaries:", prev);
          console.log("New tab summaries:", tabSummariesData);
          
          // Force immediate UI update by making a shallow copy of the object
          setTimeout(() => {
            // Log the current tab summaries to verify state was updated
            const currentActiveTab = activeTab;
            console.log(`VERIFICATION - Current active tab: ${currentActiveTab}`);
            console.log(`VERIFICATION - Current tab summary for ${currentActiveTab}:`, tabSummaries[currentActiveTab]);
          }, 500);
          
          return {...tabSummariesData};
        });
        setItems(inventoryData.items ? enrichItemsWithMultiBranchInfo(inventoryData.items, globalPartBranchMap) : []);
        setFilterCounts({ // SKU Counts
          overview: filterCountsData.overviewItems || processedMetrics.totalSKUs || 0,
          excess: filterCountsData.excessItems || processedMetrics.excessItems || 0,
          lowStock: filterCountsData.lowStockItems || processedMetrics.lowStockItems || 0,
          deadStock: filterCountsData.deadStockItems || processedMetrics.deadStockItems || 0
        });
        setLastApiCall({ entity: '', branch: null, page: 1 }); 

        setLoadingProgress(100);
      } catch (err) {
        console.error('Error during "All Branches" search in handleSearchSubmit:', err);
        setError(err.message || 'Failed to perform search for All Branches');
        setTotalInventoryCount(0); 
      } finally {
        if(timerId) clearTimeout(timerId);
        timerId = setTimeout(clearManagedLoaders, 1000); // Use the new clearManagedLoaders
      }
    } else if (filters.entity && !filters.advancedFiltersActive) { // Specific Entity Search
      const entity = filters.entity;
      console.log(`Performing search for entity ${entity} (page 1), query: "${submittedQuery}", limit: ${limit}, offset: ${offset}`);
      try {
        const statusFilter = activeTab === 'excess' ? 'excess' : activeTab === 'lowStock' ? 'low' : activeTab === 'deadStock' ? 'dead' : null;

        let itemsApiUrl = `${API_BASE_URL}/inventory/${entity}?limit=${limit}&offset=${offset}`;
        const itemsParams = [];
        if (filters.branch) itemsParams.push(`branch=${filters.branch}`);
        if (statusFilter) itemsParams.push(`status=${statusFilter}`);
        if (submittedQuery) itemsParams.push(`search=${encodeURIComponent(submittedQuery)}`);
        itemsParams.push(`sort_by=${sortConfig.key}`);
        itemsParams.push(`sort_dir=${sortConfig.direction === 'ascending' ? 'asc' : 'desc'}`);
        if (itemsParams.length > 0) {
          itemsApiUrl += '&' + itemsParams.join('&');
        }
        
        // Ensure search query is included in metrics API call
        let metricsApiUrl = `${API_BASE_URL}/metrics/${entity}`;
        const metricsParams = [];
        if (filters.branch) metricsParams.push(`branch=${filters.branch}`);
        if (submittedQuery) metricsParams.push(`search=${encodeURIComponent(submittedQuery)}`);
        if (metricsParams.length > 0) {
          metricsApiUrl += '?' + metricsParams.join('&');
        }
        
        // Ensure search query is included in filter counts API call
        let filterCountsApiUrl = `${API_BASE_URL}/filtercounts/${entity}`;
        const fcSearchParams = []; 
        if (filters.branch) fcSearchParams.push(`branch=${filters.branch}`);
        if (submittedQuery) fcSearchParams.push(`search=${encodeURIComponent(submittedQuery)}`);
        if (fcSearchParams.length > 0) {
            filterCountsApiUrl += '?' + fcSearchParams.join('&');
        }
        
        console.log(`Entity search URLs:\n  - Items: ${itemsApiUrl}\n  - Metrics: ${metricsApiUrl}\n  - FilterCounts: ${filterCountsApiUrl}`);

        const [inventoryResponse, metricsResponse, filterCountsResponse] = await Promise.all([
          fetch(itemsApiUrl),
          fetch(metricsApiUrl),
          fetch(filterCountsApiUrl)
        ]);
        setLoadingProgress(40);

        if (!inventoryResponse.ok || !metricsResponse.ok || !filterCountsResponse.ok) {
          let errorMsg = `Failed to fetch search data for entity ${entity}:`;
          if (!inventoryResponse.ok) errorMsg += ` Inventory: ${inventoryResponse.statusText} (${itemsApiUrl}).`;
          if (!metricsResponse.ok) errorMsg += ` Metrics: ${metricsResponse.statusText} (${metricsApiUrl}).`;
          if (!filterCountsResponse.ok) errorMsg += ` FilterCounts: ${filterCountsResponse.statusText} (${filterCountsApiUrl}).`;
          throw new Error(errorMsg);
        }

        const inventoryData = await inventoryResponse.json();
        const metricsData = await metricsResponse.json(); 
        const filterCountsData = await filterCountsResponse.json(); 
        setLoadingProgress(70);

        const enrichedItems = inventoryData.items ? enrichItemsWithMultiBranchInfo(inventoryData.items, globalPartBranchMap) : [];
        setTotalInventoryCount(inventoryData.totalCount || 0); // SKU count for pagination
        setItems(enrichedItems);
        
        const newMetrics = {
          totalSKUs: metricsData.totalSKUs || 0,
          excessItems: metricsData.excessItems || 0,
          lowStockItems: metricsData.lowStockItems || 0,
          deadStockItems: metricsData.deadStockItems || 0,
          totalInventoryValue: metricsData.totalInventoryValue || 0,
          inventoryTurnover: metricsData.inventoryTurnover || metricsData.inventoryTurns || 0
        };
        setMetrics(newMetrics);
        setBranchMetrics(newMetrics);

        // For part number searches, calculate metrics directly from the search results
        if (submittedQuery && enrichedItems.length > 0) {
          console.log(`Part number search for entity "${entity}": "${submittedQuery}" - calculating metrics from ${enrichedItems.length} items`);
          
          // Count items for each tab for filter counts
          const overviewCount = enrichedItems.length;
          const excessCount = enrichedItems.filter(i => i.status === 'excess').length;
          const lowStockCount = enrichedItems.filter(i => i.status === 'low').length;
          const deadStockCount = enrichedItems.filter(i => i.status === 'dead').length;
          
          // Update filter counts for tab numbers based on actual search results
          setFilterCounts({
            overview: overviewCount,
            excess: excessCount,
            lowStock: lowStockCount,
            deadStock: deadStockCount
          });
          
          // Calculate total quantities for each tab
          const overviewTotalQuantity = enrichedItems.reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
          const excessTotalQuantity = enrichedItems.filter(i => i.status === 'excess').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
          const lowStockTotalQuantity = enrichedItems.filter(i => i.status === 'low').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
          const deadStockTotalQuantity = enrichedItems.filter(i => i.status === 'dead').reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
          
          // Calculate total value for each tab
          const overviewTotalValue = enrichedItems.reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
          const excessTotalValue = enrichedItems.filter(i => i.status === 'excess').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
          const lowStockTotalValue = enrichedItems.filter(i => i.status === 'low').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
          const deadStockTotalValue = enrichedItems.filter(i => i.status === 'dead').reduce((sum, item) => sum + (Number(item.inventoryBalance) || 0), 0);
          
          // Count distinct branches for each tab
          const overviewBranches = new Set(enrichedItems.map(item => item.branch)).size;
          const excessBranches = new Set(enrichedItems.filter(i => i.status === 'excess').map(item => item.branch)).size;
          const lowStockBranches = new Set(enrichedItems.filter(i => i.status === 'low').map(item => item.branch)).size;
          const deadStockBranches = new Set(enrichedItems.filter(i => i.status === 'dead').map(item => item.branch)).size;
          
          // Calculate inventory turnover if possible
          let overviewTurnover = newMetrics.inventoryTurnover;
          if (overviewTotalValue > 0) {
            // Try to calculate from search results
            const ttmQtyUsed = enrichedItems.reduce((sum, item) => sum + (Number(item.ttmQtyUsed) || 0), 0);
            if (ttmQtyUsed > 0) {
              const avgCost = overviewTotalValue / overviewTotalQuantity;
              const annualCogs = ttmQtyUsed * avgCost;
              overviewTurnover = annualCogs / overviewTotalValue;
            }
          }
          
          console.log("Calculated metrics for search:", {
            counts: { overview: overviewCount, excess: excessCount, lowStock: lowStockCount, deadStock: deadStockCount },
            quantity: { overview: overviewTotalQuantity, excess: excessTotalQuantity, lowStock: lowStockTotalQuantity, deadStock: deadStockTotalQuantity },
            value: { overview: overviewTotalValue, excess: excessTotalValue, lowStock: lowStockTotalValue, deadStock: deadStockTotalValue },
            branches: { overview: overviewBranches, excess: excessBranches, lowStock: lowStockBranches, deadStock: deadStockBranches }
          });
          
          // Set tab summaries using calculated values
          setTabSummaries({
            overview: { 
              totalValue: overviewTotalValue,
              totalQuantity: overviewTotalQuantity,
              branchCount: overviewBranches,
              entityCount: overviewBranches > 0 ? 1 : 0,
              inventoryTurnover: overviewTurnover
            },
            excess: { 
              totalValue: excessTotalValue,
              totalQuantity: excessTotalQuantity,
              branchCount: excessBranches,
              entityCount: excessBranches > 0 ? 1 : 0,
              inventoryTurnover: 0
            },
            lowStock: { 
              totalValue: lowStockTotalValue,
              totalQuantity: lowStockTotalQuantity,
              branchCount: lowStockBranches,
              entityCount: lowStockBranches > 0 ? 1 : 0,
              inventoryTurnover: 0
            },
            deadStock: { 
              totalValue: deadStockTotalValue,
              totalQuantity: deadStockTotalQuantity,
              branchCount: deadStockBranches,
              entityCount: deadStockBranches > 0 ? 1 : 0,
              inventoryTurnover: 0
            }
          });
        } else {
          // For regular views (no search), use API data
          setFilterCounts({ // SKU Counts
            overview: filterCountsData.overviewItems || filterCountsData.totalItems || (inventoryData.totalCount || 0),
            excess: filterCountsData.excessItems || 0,
            lowStock: filterCountsData.lowStockItems || 0,
            deadStock: filterCountsData.deadStockItems || 0
          });

          if (filterCountsData.summaries) { 
              const updatedSummaries = {};
              for (const tabKey in filterCountsData.summaries) {
                  updatedSummaries[tabKey] = {
                  ...filterCountsData.summaries[tabKey],
                  // The API directly provides totalQuantity in its summaries for physical stock sum
                  totalQuantity: filterCountsData.summaries[tabKey]?.totalQuantity || 0 
                  };
              }
              setTabSummaries(updatedSummaries);
          } else { 
              console.warn("filterCountsData.summaries missing (entity view). Sum of physical stock in summary will be based on current page's items only.");
              const itemsForSummaryFallback = enrichedItems;
              const currentBranchCountFallback = filters.branch ? 1 : (entity ? (new Set(itemsForSummaryFallback.map(i => i.branch))).size : 0);
              const sumQuantityByStatusFallback = (status) => itemsForSummaryFallback.filter(i => i.status === status).reduce((sum, item) => sum + (item.quantityOnHand || 0), 0);

              setTabSummaries({
                  overview: { 
                      totalValue: newMetrics.totalInventoryValue, 
                      totalQuantity: itemsForSummaryFallback.reduce((sum, item) => sum + (item.quantityOnHand || 0), 0),  // Sum for current page
                      branchCount: currentBranchCountFallback, 
                      inventoryTurnover: newMetrics.inventoryTurnover 
                  },
                  excess: { 
                      totalValue: 0, // Fallback, ideally from filterCountsData
                      totalQuantity: sumQuantityByStatusFallback('excess'), // Sum for current page
                      branchCount: currentBranchCountFallback, 
                      inventoryTurnover: 0 // Fallback
                  },
                  lowStock: { 
                      totalValue: 0, // Fallback
                      totalQuantity: sumQuantityByStatusFallback('low'), // Sum for current page
                      branchCount: currentBranchCountFallback, 
                      inventoryTurnover: 0 // Fallback
                  },
                  deadStock: { 
                      totalValue: 0, // Fallback
                      totalQuantity: sumQuantityByStatusFallback('dead'), // Sum for current page
                      branchCount: currentBranchCountFallback, 
                      inventoryTurnover: 0 // Fallback
                  }
              });
          }
        }
        setLastApiCall({ entity: entity, branch: filters.branch, page: 1 }); 

        setLoadingProgress(100);
      } catch (err) {
        console.error(`Error during entity search for ${entity} in handleSearchSubmit:`, err);
        setError(err.message || `Failed to search entity ${entity}`);
        setTotalInventoryCount(0); 
      } finally {
        if(timerId) clearTimeout(timerId);
        timerId = setTimeout(clearManagedLoaders, 1000); // Use the new clearManagedLoaders
      }
    } else if (filters.advancedFiltersActive) {
      console.log('Advanced filters active, search query updated. Page reset to 1. Relying on advanced filter effect for data fetch.');
      // The useEffect for advanced filters will handle its own data fetching and loading states.
      // It already depends on filters.searchQuery and currentPage.
      // It should set its own isLoadingEntity, isTabChanging, isFilterCountsLoading as needed.
      // For now, we just log and let that effect take over.
      // Ensure that effect also uses a timer for its loading states if it has a delay.
    } else {
      console.warn('handleSearchSubmit called in an unexpected state (no entity, not advanced filters).');
      if(timerId) clearTimeout(timerId); // Clear timer if set
      clearManagedLoaders(); // Clear loaders directly
      setTotalInventoryCount(0); 
    }
  };

  // NEW: Handler for page changes from Pagination component
  const handlePageChange = (page) => {
    if (page !== currentPage) {
      setCurrentPage(page);
      // Optional: Scroll to top of table or results when page changes
      // window.scrollTo({ top: document.getElementById('inventory-table-section')?.offsetTop || 0, behavior: 'smooth' });
      console.log(`Page changed to: ${page}`);
    }
  };

  // Calculate total pages for pagination
  const totalPages = Math.ceil(totalInventoryCount / ITEMS_PER_PAGE);

  const totalCartItems = cart.orders.length + cart.transfers.length;
  // const currentSidebarWidth = sidebarExpanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED; // REMOVED
  const activeAccount = msalInstance.getActiveAccount();

  const handleNavigation = (view) => {
    if (view === '/order-requests') {
      setCurrentView('orderRequests');
    } else if (view === '/transfer-requests') {
      setCurrentView('transferRequests');
    } else {
      setCurrentView('inventory');
    }
    setModalIsOpen(false);
    setIsCartReviewModalOpen(false);
    setAdvancedFiltersOpen(false);
  };

  // const handleToggleSidebar = (expanded) => { // REMOVED
  //   setSidebarExpanded(expanded);
  // };

  const handleLogout = () => {
    msalInstance.logoutRedirect({
      postLogoutRedirectUri: "/",
    });
  };

  const [initialOrderRequestsSection, setInitialOrderRequestsSection] = useState('pending'); // Default to pending, or activeCart

  const handleNavigateToOrderCart = () => {
    setInitialOrderRequestsSection('activeCart');
    handleNavigation('/order-requests'); // handleNavigation already switches view and closes modals
  };

  const handleNavigateToTransferCart = () => {
    setInitialOrderRequestsSection('transferCart'); // Set to transferCart section
    handleNavigation('/transfer-requests'); // Navigate to transfer requests page
  };

  // Helper function to get user email consistently
  const getUserEmail = () => {
    const account = accounts[0];
    console.log('getUserEmail - Full account object:', account);
    console.log('getUserEmail - account.username:', account?.username);
    console.log('getUserEmail - account.idTokenClaims:', account?.idTokenClaims);
    console.log('getUserEmail - account.idTokenClaims.email:', account?.idTokenClaims?.email);
    
    const email = account?.username || account?.idTokenClaims?.email || '';
    console.log('getUserEmail - Final email result:', email);
    return email;
  };

  // Log handleSubmitRequest right before it's used in props for OrderRequestsPage
  console.log('App.js - handleSubmitRequest at the point of OrderRequestsPage props definition:', handleSubmitRequest);

  const orderRequestsPageProps = {
    activeUserEmail: getUserEmail(),
    // ... existing code ...
  };

  const handleNetworkStatusChange = (status) => {
    setNetworkStatusFilter(status);
    setCurrentPage(1); // Reset to first page on filter change
  };

  return (
    <>
      <UnauthenticatedTemplate>
        <LoginPage />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <ProtectedRoute>
          <div className="flex min-h-screen bg-[#f9fafb]"> {/* This flex container might need adjustment if sidebar is pure overlay */} 
            <Sidebar 
              onNavigate={handleNavigation} 
              currentView={currentView}
            />
            {/* Main Content Area - No longer has dynamic marginLeft or width */}
            <div 
              className="flex-grow p-0 m-0" /* Simplified classes, transitions removed */
              // style={{ marginLeft: currentSidebarWidth, width: `calc(100% - ${currentSidebarWidth})` }} // REMOVED STYLE
            >
              {currentView === 'inventory' ? (
                // The container mx-auto etc. should be INSIDE this view for proper centering if needed
                <div className="container mx-auto px-4 py-6">
                  <Header 
                    isLoading={isInitializing || isLoadingEntity || isTabChanging} 
                    error={error}
                    filters={filters} 
                    onFilterChange={handleFilterChange} 
                    entities={entities} 
                    entityBranches={entityBranches} 
                  />
                  {error && (
                    <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg backdrop-blur-md relative fade-out-element" role="alert">
                      <strong className="font-bold">API Error:</strong>
                      <span className="block sm:inline"> {error}</span>
                      <span className="block text-sm mt-2 text-red-600/80">Using mock data as fallback. Some metrics may not reflect actual inventory.</span>
                      <button 
                        onClick={() => setError(null)} 
                        className="absolute top-0 right-0 mt-2 mr-2 text-red-600 hover:text-red-800"
                        aria-label="Dismiss"
                      >×</button>
                    </div>
                  )}
                  <main className="mt-6">
                    {isInitializing ? (
                      <div className="flex justify-center items-center h-64 glass-panel p-6">
                        <div className="text-center w-full max-w-md">
                          <div className="flex justify-center">
                            <div className="relative h-10 w-10">
                              <svg className="animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" style={{color: 'rgb(226, 232, 240)'}} /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{color: 'rgb(79, 70, 229)'}} /></svg>
                            </div>
                          </div>
                          <p className="text-indigo-700 font-medium mt-4">Loading inventory data...</p><p className="text-sm text-gray-500 mt-2">Please wait...</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="glass-panel p-6 mb-8">
                          <Filters 
                            filters={filters} 
                            onFilterChange={handleFilterChange}
                            entities={entities}
                            availableBranches={entityBranches}
                            onSearchSubmit={handleSearchSubmit}
                          />
                        </div>
                        {isLoadingEntity && !isTabChanging && !filters.advancedFiltersActive && !(filters.entity === '' && lastApiCall.entity === '') ? (
                          <div className="flex justify-center items-center h-64 glass-panel p-6 mb-8">
                            <div className="text-center w-full max-w-md">
                              <div className="flex justify-center">
                                <div className="relative h-10 w-10">
                                  <svg className="animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" style={{color: 'rgb(226, 232, 240)'}} /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{color: 'rgb(79, 70, 229)'}} /></svg>
                                </div>
                              </div>
                              <p className="text-indigo-700 font-medium mt-4">
                                {filters.advancedFiltersActive 
                                  ? "Loading data for advanced filters..." 
                                  : `Loading ${filters.entity || 'selected view'} data...`}
                              </p><p className="text-sm text-gray-500 mt-2">Please wait...</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="glass-panel p-6 mb-8">
                              <KeyMetrics metrics={branchMetrics} completeData={items} isLoading={isLoadingEntity && !(filters.entity === '' && lastApiCall.entity === '')} />
                            </div>
                            <div className="glass-panel p-6 relative">
                              <div className="absolute top-6 right-6 z-10 flex space-x-2">
                                <button
                                  onClick={handleNavigateToOrderCart} // UPDATED onClick
                                  className="relative inline-flex items-center p-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                                  aria-label="View Order Cart"
                                  title="View Order Cart"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                  </svg>
                                  {cart.orders.length > 0 && (
                                    <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                                      {cart.orders.length}
                                    </span>
                                  )}
                                </button>
                                <button
                                  onClick={handleNavigateToTransferCart}
                                  className="relative inline-flex items-center p-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                                  aria-label="View Transfer Cart"
                                  title="View Transfer Cart"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.05-2.05A7 7 0 0013 16zM17 16h2a2 2 0 002-2v-5l-3-4H6" />
                                  </svg>
                                  {cart.transfers.length > 0 && (
                                    <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                                      {cart.transfers.length}
                                    </span>
                                  )}
                                </button>
                              </div>
                              <TabNavigation 
                                activeTab={activeTab} 
                                onTabChange={handleTabChange} 
                                metrics={{
                                  totalSKUs: filterCounts.overview ?? branchMetrics.totalSKUs ?? 0,
                                  excessItems: filterCounts.excess ?? branchMetrics.excessItems ?? 0,
                                  lowStockItems: filterCounts.lowStock ?? branchMetrics.lowStockItems ?? 0,
                                  deadStockItems: filterCounts.deadStock ?? branchMetrics.deadStockItems ?? 0
                                }}
                                isLoading={isLoadingEntity || isFilterCountsLoading || isTabChanging}
                              />
                              <FilterSummaryDisplay
                                activeTab={activeTab}
                                isLoading={isTabChanging || isFilterCountsLoading || (isLoadingEntity && !(filters.entity === '' && lastApiCall.entity === ''))}
                                branchCount={tabSummaries[activeTab]?.branchCount || 0}
                                displayedItemsCount={filteredItems.length} 
                                totalItemsFromAPI={totalInventoryCount} 
                                totalQuantity={tabSummaries[activeTab]?.totalQuantity || 0} 
                                totalValue={tabSummaries[activeTab]?.totalValue || 0}
                                inventoryTurnover={tabSummaries[activeTab]?.inventoryTurnover || 0}
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={handlePageChange}
                              />
                              <InventoryTable 
                                items={filteredItems}
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                onViewItem={handleViewItem}
                                networkStatusFilter={networkStatusFilter}
                                onNetworkStatusChange={handleNetworkStatusChange}
                                activeTab={activeTab}
                              />
                              <div className="mt-4 text-sm text-gray-500">
                                <p>Showing {filteredItems.length} items | Total {activeTab === 'overview' ? 'SKUs' : activeTab === 'excess' ? 'excess SKUs' : activeTab === 'lowStock' ? 'low stock SKUs' : 'dead stock SKUs'} {filters.advancedFiltersActive ? ' for Advanced Filters' : filters.entity ? ` for ${filters.entity}` : ' for All Branches'}: {isTabChanging || isFilterCountsLoading || (isLoadingEntity && !(filters.entity === '' && lastApiCall.entity === '')) ? "Loading..." : (tabSummaries[activeTab]?.totalQuantity ?? filterCounts[activeTab] ?? '0')}</p>
                                <p className="text-xs italic mt-1">Use search and filters to refine results.</p>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </main>
                </div>
              ) : currentView === 'orderRequests' ? (
                <div className="container mx-auto px-4 py-6">
                  <OrderRequestsPage 
                    activeOrderCartItems={cart.orders}
                    onRemoveActiveOrderItem={(index) => handleRemoveItemFromCart('orders', index)}
                    onClearActiveOrderCart={() => handleClearCart('orders')} 
                    onSubmitActiveOrderCart={(action) => handleSubmitRequest('orders', action)}
                    requestStatus={requestStatus}
                    isSubmittingOrderCart={requestStatus.isSubmitting && cart.submittingType === 'orders'} 
                    initialSection={initialOrderRequestsSection}
                    apiBaseUrl={API_BASE_URL} // <-- ADDED PROP
                  />
                </div>
              ) : currentView === 'transferRequests' ? (
                <div className="container mx-auto px-4 py-6">
                  <TransferRequestsPage 
                    activeUserEmail={getUserEmail()}
                    activeTransferCartItems={cart.transfers}
                    onRemoveActiveTransferItem={(index) => handleRemoveItemFromCart('transfers', index)}
                    onClearActiveTransferCart={() => handleClearCart('transfers')} 
                    onSubmitTransferRequest={(action) => handleSubmitRequest('transfers', action)}
                    requestStatus={requestStatus}
                    isSubmittingTransferCart={requestStatus.isSubmitting && cart.submittingType === 'transfers'} 
                    initialSection={initialOrderRequestsSection}
                    apiBaseUrl={API_BASE_URL}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <ItemDetailModal
            item={selectedItem}
            allBranchItems={itemBranchDetails}
            isOpen={modalIsOpen}
            onClose={handleCloseModal}
            onAddToCart={handleAddToCart}
            cart={cart}
            requestStatus={requestStatus}
            onSubmitRequest={handleSubmitRequest}
            onOpenCartReview={handleOpenCartReviewModal}
            onNavigateToOrderCart={handleNavigateToOrderCart}
            onNavigateToTransferCart={handleNavigateToTransferCart}
            currentBranch={filters.branch || (filters.entity && entities.find(e => e.id === filters.entity)?.name) || 'All Branches'}
          />
          <CartReviewModal
            isOpen={isCartReviewModalOpen}
            onClose={handleCloseCartReviewModal}
            cart={cart}
            onSubmitRequest={handleSubmitRequest}
            requestStatus={requestStatus}
            cartViewType={cartViewType}
            onRemoveItemFromCart={handleRemoveItemFromCart}
            onClearCart={handleClearCart}
          />
          {AdvancedFiltersModal && (<AdvancedFiltersModal isOpen={advancedFiltersOpen} onClose={handleCloseAdvancedFilters} entities={entities} entityBranches={entityBranches} selectedFilters={filters.advancedFilters || {}} onApplyFilters={handleApplyAdvancedFilters} />)}
        </ProtectedRoute>
      </AuthenticatedTemplate>
    </>
  );
}

// Main App component wrapper
function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <AppContent />
    </MsalProvider>
  );
}

export default App;